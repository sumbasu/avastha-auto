import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, markFirebaseUnavailable } from './firebase';
import { useAuthStore } from './auth-store';

export interface ContactData {
  id: string;
  name: string;
  countryCode: string;
  phone: string;
  email?: string;
  city: string;
  language: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  communityId?: string;
  source: 'manual' | 'bulk' | 'ocr';
  syncStatus: 'pending' | 'synced' | 'failed';
}

interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  data: ContactData | { id: string };
  timestamp: string;
  retryCount: number;
}

export interface DatabaseStats {
  total: number;
  manual: number;
  bulk: number;
  ocr: number;
}

interface ContactsState {
  contacts: ContactData[];
  syncQueue: SyncQueueItem[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingSyncCount: number;
  dbStats: DatabaseStats;
  isLoadingStats: boolean;
  addContact: (contact: Omit<ContactData, 'id' | 'createdAt' | 'syncStatus'>) => Promise<{ success: boolean; error?: string }>;
  addBulkContacts: (contacts: Omit<ContactData, 'id' | 'createdAt' | 'syncStatus'>[]) => Promise<{ added: number; duplicates: string[] }>;
  deleteContact: (id: string) => Promise<void>;
  loadContacts: () => Promise<void>;
  clearAllContacts: () => Promise<void>;
  syncToBackend: () => Promise<{ success: number; failed: number }>;
  markAsSynced: (ids: string[]) => Promise<void>;
  isPhoneDuplicate: (countryCode: string, phone: string, excludeId?: string) => boolean;
  getFullPhoneNumber: (contact: ContactData) => string;
  fetchDatabaseStats: () => Promise<void>;
}

const CONTACTS_KEY = '@data_collector_contacts';
const SYNC_QUEUE_KEY = '@data_collector_sync_queue';
const LAST_SYNC_KEY = '@data_collector_last_sync';
const CONTACTS_COLLECTION = 'contacts';

// Backend API configuration - Replace with your actual backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

// Helper to normalize phone number for comparison
const normalizePhone = (countryCode: string, phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '');
  const cleanCode = countryCode.replace(/\D/g, '');
  return `+${cleanCode}${cleanPhone}`;
};

// Check if phone exists in community (Firestore)
const checkCommunityPhoneDuplicate = async (
  communityId: string,
  countryCode: string,
  phone: string
): Promise<{ isDuplicate: boolean; collectorName?: string }> => {
  if (!isFirebaseConfigured() || !db || !communityId || !phone) {
    return { isDuplicate: false };
  }

  try {
    const normalizedPhone = normalizePhone(countryCode, phone);
    const contactsRef = collection(db, CONTACTS_COLLECTION);
    const q = query(
      contactsRef,
      where('communityId', '==', communityId),
      where('phone', '==', phone)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Check if any match has the same normalized phone
      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        const existingNormalized = normalizePhone(data.countryCode || '91', data.phone);
        if (existingNormalized === normalizedPhone) {
          return {
            isDuplicate: true,
            collectorName: data.createdByName || 'another collector'
          };
        }
      }
    }

    // Also check with countryCode + phone combination
    const q2 = query(
      contactsRef,
      where('communityId', '==', communityId),
      where('countryCode', '==', countryCode),
      where('phone', '==', phone)
    );
    const snapshot2 = await getDocs(q2);

    if (!snapshot2.empty) {
      const data = snapshot2.docs[0].data();
      return {
        isDuplicate: true,
        collectorName: data.createdByName || 'another collector'
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.log('Error checking community phone duplicate:', error);
    return { isDuplicate: false };
  }
};

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  syncQueue: [],
  isLoading: true,
  isSyncing: false,
  lastSyncTime: null,
  pendingSyncCount: 0,
  dbStats: { total: 0, manual: 0, bulk: 0, ocr: 0 },
  isLoadingStats: false,

  getFullPhoneNumber: (contact: ContactData) => {
    if (!contact.phone) return '';
    return normalizePhone(contact.countryCode || '91', contact.phone);
  },

  isPhoneDuplicate: (countryCode: string, phone: string, excludeId?: string) => {
    if (!phone || !phone.trim()) return false;

    const normalizedNew = normalizePhone(countryCode, phone);
    return get().contacts.some((contact) => {
      if (excludeId && contact.id === excludeId) return false;
      if (!contact.phone) return false;
      const normalizedExisting = normalizePhone(contact.countryCode || '91', contact.phone);
      return normalizedExisting === normalizedNew;
    });
  },

  addContact: async (contactData) => {
    // Check for duplicate phone number locally first
    if (contactData.phone && contactData.phone.trim()) {
      const isDuplicateLocal = get().isPhoneDuplicate(contactData.countryCode, contactData.phone);
      if (isDuplicateLocal) {
        return {
          success: false,
          error: `A contact with phone number +${contactData.countryCode} ${contactData.phone} already exists locally`
        };
      }

      // Check community-wide duplicate in Firestore
      if (contactData.communityId) {
        const { isDuplicate, collectorName } = await checkCommunityPhoneDuplicate(
          contactData.communityId,
          contactData.countryCode,
          contactData.phone
        );
        if (isDuplicate) {
          return {
            success: false,
            error: `This phone number (+${contactData.countryCode} ${contactData.phone}) was already added by ${collectorName} in this community`
          };
        }
      }
    }



    // Check Global Community Limit
    if (contactData.communityId == 'global_community_default') {
      const authUser = useAuthStore.getState().user;
      const contacts = get().contacts;
      const userGlobalEntries = contacts.filter(c =>
        (c.communityId === 'global_community_default' || !c.communityId) &&
        c.createdBy === authUser?.id
      ).length;

      if (userGlobalEntries >= 50) {
        return {
          success: false,
          error: 'LIMIT_REACHED_GLOBAL'
        };
      }
    }

    const user = useAuthStore.getState().user;
    const newContact: ContactData = {
      ...contactData,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    const updatedContacts = [newContact, ...get().contacts];

    // Add to sync queue with creator name for future duplicate checks
    const syncItem: SyncQueueItem = {
      id: newContact.id,
      action: 'create',
      data: {
        ...newContact,
        createdByName: user?.name || 'Unknown',
      } as ContactData & { createdByName: string },
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    const updatedQueue = [...get().syncQueue, syncItem];

    // Save to local storage
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updatedContacts));
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue));

    set({
      contacts: updatedContacts,
      syncQueue: updatedQueue,
      pendingSyncCount: updatedQueue.length,
    });

    // Try to sync if online
    get().syncToBackend();

    return { success: true };
  },

  addBulkContacts: async (contactsData) => {
    const timestamp = Date.now();
    const duplicates: string[] = [];
    const validContacts: Omit<ContactData, 'id' | 'createdAt' | 'syncStatus'>[] = [];
    const user = useAuthStore.getState().user;

    // Track phones we're adding in this batch to detect duplicates within the batch
    const phonesInBatch = new Set<string>();

    // Get communityId from first contact (all should be same community)
    const communityId = contactsData[0]?.communityId;

    // Check Global Community Limit for Bulk Upload
    if (communityId === 'global_community_default') {
      const currentContacts = get().contacts;
      const userGlobalEntries = currentContacts.filter(c =>
        (c.communityId === 'global_community_default' || !c.communityId) &&
        c.createdBy === user?.id
      ).length;

      if (userGlobalEntries + contactsData.length > 50) {
        return {
          added: 0,
          duplicates: [],
          error: 'LIMIT_REACHED_GLOBAL'
        };
      }
    }

    for (const contact of contactsData) {
      if (contact.phone && contact.phone.trim()) {
        const normalizedPhone = normalizePhone(contact.countryCode || '91', contact.phone);

        // Check against existing local contacts
        const existsInDb = get().isPhoneDuplicate(contact.countryCode || '91', contact.phone);

        // Check against contacts we're adding in this batch
        const existsInBatch = phonesInBatch.has(normalizedPhone);

        // Check community-wide duplicate in Firestore
        let existsInCommunity = false;
        if (communityId && !existsInDb && !existsInBatch) {
          const { isDuplicate } = await checkCommunityPhoneDuplicate(
            communityId,
            contact.countryCode || '91',
            contact.phone
          );
          existsInCommunity = isDuplicate;
        }

        if (existsInDb || existsInBatch || existsInCommunity) {
          duplicates.push(`${contact.name} (+${contact.countryCode || '91'} ${contact.phone})`);
          continue;
        }

        phonesInBatch.add(normalizedPhone);
      }

      validContacts.push(contact);
    }

    if (validContacts.length === 0) {
      return { added: 0, duplicates };
    }

    const newContacts: ContactData[] = validContacts.map((c, index) => ({
      ...c,
      id: `${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending' as const,
    }));

    // Add all to sync queue with creator name
    const newSyncItems: SyncQueueItem[] = newContacts.map((contact) => ({
      id: contact.id,
      action: 'create' as const,
      data: {
        ...contact,
        createdByName: user?.name || 'Unknown',
      } as ContactData & { createdByName: string },
      timestamp: new Date().toISOString(),
      retryCount: 0,
    }));

    const updatedContacts = [...newContacts, ...get().contacts];
    const updatedQueue = [...get().syncQueue, ...newSyncItems];

    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updatedContacts));
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue));

    set({
      contacts: updatedContacts,
      syncQueue: updatedQueue,
      pendingSyncCount: updatedQueue.length,
    });

    // Try to sync if online
    get().syncToBackend();

    return { added: newContacts.length, duplicates };
  },

  deleteContact: async (id) => {
    const contact = get().contacts.find((c) => c.id === id);
    const updatedContacts = get().contacts.filter((c) => c.id !== id);

    // If contact was already synced, add delete to sync queue
    if (contact && contact.syncStatus === 'synced') {
      const syncItem: SyncQueueItem = {
        id,
        action: 'delete',
        data: { id },
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };
      const updatedQueue = [...get().syncQueue, syncItem];
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue));
      set({ syncQueue: updatedQueue, pendingSyncCount: updatedQueue.length });
    } else {
      // Remove from sync queue if it was pending
      const updatedQueue = get().syncQueue.filter((item) => item.id !== id);
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue));
      set({ syncQueue: updatedQueue, pendingSyncCount: updatedQueue.length });
    }

    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updatedContacts));
    set({ contacts: updatedContacts });

    // Try to sync if online
    get().syncToBackend();
  },

  loadContacts: async () => {
    try {
      // First load from local storage for immediate display
      const [contactsJson, queueJson, lastSync, cachedStats] = await Promise.all([
        AsyncStorage.getItem(CONTACTS_KEY),
        AsyncStorage.getItem(SYNC_QUEUE_KEY),
        AsyncStorage.getItem(LAST_SYNC_KEY),
        AsyncStorage.getItem('@data_collector_db_stats'),
      ]);

      let contacts = contactsJson ? (JSON.parse(contactsJson) as ContactData[]) : [];
      const syncQueue = queueJson ? (JSON.parse(queueJson) as SyncQueueItem[]) : [];
      const dbStats = cachedStats ? (JSON.parse(cachedStats) as DatabaseStats) : { total: 0, manual: 0, bulk: 0, ocr: 0 };

      set({
        contacts,
        syncQueue,
        isLoading: false,
        lastSyncTime: lastSync,
        pendingSyncCount: syncQueue.length,
        dbStats,
      });

      // Then try to sync with Firestore if configured
      if (isFirebaseConfigured() && db) {
        try {
          const user = useAuthStore.getState().user;
          if (user) {
            const contactsRef = collection(db, CONTACTS_COLLECTION);
            const q = query(contactsRef, where('createdBy', '==', user.id));
            const snapshot = await getDocs(q);

            const firestoreContacts: ContactData[] = [];
            snapshot.forEach((docSnapshot) => {
              const data = docSnapshot.data();
              firestoreContacts.push({
                id: docSnapshot.id,
                name: data.name || '',
                countryCode: data.countryCode || '91',
                phone: data.phone || '',
                email: data.email,
                city: data.city || '',
                language: data.language || '',
                notes: data.notes,
                createdAt: data.createdAt || new Date().toISOString(),
                createdBy: data.createdBy || user.id,
                communityId: data.communityId,
                source: data.source || 'manual',
                syncStatus: 'synced',
              });
            });

            // Merge: Firestore contacts + local pending contacts
            const pendingContacts = contacts.filter(c => c.syncStatus === 'pending');
            const mergedContacts = [
              ...pendingContacts,
              ...firestoreContacts.filter(fc =>
                !pendingContacts.some(pc => pc.id === fc.id)
              ),
            ];

            // Sort by createdAt descending
            mergedContacts.sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(mergedContacts));
            set({ contacts: mergedContacts });
          }
        } catch (error) {
          console.log('Error fetching from Firestore:', error);
        }
      }

      // Try to sync pending items
      if (syncQueue.length > 0) {
        get().syncToBackend();
      }
    } catch {
      set({ isLoading: false });
    }
  },

  clearAllContacts: async () => {
    // Only clear local contacts and sync queue, preserve DB stats
    await Promise.all([
      AsyncStorage.removeItem(CONTACTS_KEY),
      AsyncStorage.removeItem(SYNC_QUEUE_KEY),
    ]);
    set({ contacts: [], syncQueue: [], pendingSyncCount: 0 });
    // Refresh stats from database to show accurate counts
    get().fetchDatabaseStats();
  },

  syncToBackend: async () => {
    const { syncQueue, isSyncing } = get();

    // Don't sync if already syncing or queue is empty
    if (isSyncing || syncQueue.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Check network connectivity
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('Offline - sync will happen when back online');
      return { success: 0, failed: 0 };
    }

    set({ isSyncing: true });

    let successCount = 0;
    let failedCount = 0;
    const processedIds: string[] = [];
    const failedItems: SyncQueueItem[] = [];

    // Try Firestore sync first if configured
    if (isFirebaseConfigured() && db) {
      try {
        const batch = writeBatch(db);
        const itemsToProcess = [...syncQueue];

        for (const item of itemsToProcess) {
          const docRef = doc(db, CONTACTS_COLLECTION, item.id);

          switch (item.action) {
            case 'create':
            case 'update':
              if ('name' in item.data) {
                const contactData = item.data as ContactData & { createdByName?: string };
                batch.set(docRef, {
                  name: contactData.name,
                  countryCode: contactData.countryCode,
                  phone: contactData.phone,
                  email: contactData.email || null,
                  city: contactData.city,
                  language: contactData.language,
                  notes: contactData.notes || null,
                  createdAt: contactData.createdAt,
                  createdBy: contactData.createdBy,
                  createdByName: contactData.createdByName || null,
                  communityId: contactData.communityId || null,
                  source: contactData.source,
                  updatedAt: serverTimestamp(),
                }, { merge: true });
              }
              break;
            case 'delete':
              batch.delete(docRef);
              break;
          }

          processedIds.push(item.id);
          successCount++;
        }

        // Commit the batch with timeout
        const commitPromise = batch.commit();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Firestore timeout')), 10000)
        );

        await Promise.race([commitPromise, timeoutPromise]);
        console.log('Firestore batch sync completed:', successCount, 'items');

        // Update contacts sync status
        if (processedIds.length > 0) {
          await get().markAsSynced(processedIds);
        }

        // Update sync queue with only failed items
        await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failedItems));

        // Update last sync time
        const lastSyncTime = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncTime);

        set({
          syncQueue: failedItems,
          isSyncing: false,
          lastSyncTime,
          pendingSyncCount: failedItems.length,
        });

        // Refresh database stats after successful sync
        if (successCount > 0) {
          get().fetchDatabaseStats();
        }

        return { success: successCount, failed: failedCount };
      } catch (error) {
        console.log('Firestore batch sync error:', error);
        // Mark Firebase as unavailable after connection failure
        markFirebaseUnavailable();
        // Stop syncing - data is safe locally
        set({ isSyncing: false });
        return { success: 0, failed: 0 };
      }
    }

    // Fallback to REST API if configured
    if (!API_BASE_URL) {
      console.log('No backend configured - data stored locally only');
      set({ isSyncing: false });
      return { success: 0, failed: 0 };
    }

    for (const item of syncQueue) {
      try {
        let response: Response;

        switch (item.action) {
          case 'create':
            response = await fetch(`${API_BASE_URL}/contacts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.data),
            });
            break;
          case 'update':
            response = await fetch(`${API_BASE_URL}/contacts/${item.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.data),
            });
            break;
          case 'delete':
            response = await fetch(`${API_BASE_URL}/contacts/${item.id}`, {
              method: 'DELETE',
            });
            break;
          default:
            continue;
        }

        if (response.ok) {
          successCount++;
          processedIds.push(item.id);
        } else {
          throw new Error(`API returned ${response.status}`);
        }
      } catch (error) {
        failedCount++;
        // Retry up to 3 times
        if (item.retryCount < 3) {
          failedItems.push({ ...item, retryCount: item.retryCount + 1 });
        }
      }
    }

    // Update contacts sync status
    if (processedIds.length > 0) {
      await get().markAsSynced(processedIds);
    }

    // Update sync queue with only failed items
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failedItems));

    // Update last sync time
    const lastSyncTime = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncTime);

    set({
      syncQueue: failedItems,
      isSyncing: false,
      lastSyncTime,
      pendingSyncCount: failedItems.length,
    });

    // Refresh database stats after successful sync
    if (successCount > 0) {
      get().fetchDatabaseStats();
    }

    return { success: successCount, failed: failedCount };
  },

  markAsSynced: async (ids: string[]) => {
    const updatedContacts = get().contacts.map((contact) => {
      if (ids.includes(contact.id)) {
        return { ...contact, syncStatus: 'synced' as const };
      }
      return contact;
    });

    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updatedContacts));
    set({ contacts: updatedContacts });
  },

  fetchDatabaseStats: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoadingStats: true });

    // Try to fetch from Firestore
    if (isFirebaseConfigured() && db) {
      try {
        const contactsRef = collection(db, CONTACTS_COLLECTION);
        const q = query(contactsRef, where('createdBy', '==', user.id));
        const snapshot = await getDocs(q);

        const stats: DatabaseStats = {
          total: 0,
          manual: 0,
          bulk: 0,
          ocr: 0,
        };

        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          stats.total++;
          const source = data.source as 'manual' | 'bulk' | 'ocr';
          if (source === 'manual') stats.manual++;
          else if (source === 'bulk') stats.bulk++;
          else if (source === 'ocr') stats.ocr++;
        });

        // Save stats to local storage for persistence
        await AsyncStorage.setItem('@data_collector_db_stats', JSON.stringify(stats));
        set({ dbStats: stats, isLoadingStats: false });
        return;
      } catch (error) {
        console.log('Error fetching database stats:', error);
      }
    }

    // Fallback: try to load cached stats from local storage
    try {
      const cachedStats = await AsyncStorage.getItem('@data_collector_db_stats');
      if (cachedStats) {
        set({ dbStats: JSON.parse(cachedStats), isLoadingStats: false });
        return;
      }
    } catch {
      // Ignore
    }

    set({ isLoadingStats: false });
  },
}));

// Country codes list
export const COUNTRY_CODES = [
  { code: '91', country: 'India', flag: '🇮🇳' },
  { code: '1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '44', country: 'UK', flag: '🇬🇧' },
  { code: '971', country: 'UAE', flag: '🇦🇪' },
  { code: '966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '65', country: 'Singapore', flag: '🇸🇬' },
  { code: '61', country: 'Australia', flag: '🇦🇺' },
  { code: '49', country: 'Germany', flag: '🇩🇪' },
  { code: '33', country: 'France', flag: '🇫🇷' },
  { code: '81', country: 'Japan', flag: '🇯🇵' },
  { code: '86', country: 'China', flag: '🇨🇳' },
  { code: '82', country: 'South Korea', flag: '🇰🇷' },
  { code: '7', country: 'Russia', flag: '🇷🇺' },
  { code: '55', country: 'Brazil', flag: '🇧🇷' },
  { code: '27', country: 'South Africa', flag: '🇿🇦' },
  { code: '234', country: 'Nigeria', flag: '🇳🇬' },
  { code: '254', country: 'Kenya', flag: '🇰🇪' },
  { code: '60', country: 'Malaysia', flag: '🇲🇾' },
  { code: '62', country: 'Indonesia', flag: '🇮🇩' },
  { code: '63', country: 'Philippines', flag: '🇵🇭' },
  { code: '66', country: 'Thailand', flag: '🇹🇭' },
  { code: '84', country: 'Vietnam', flag: '🇻🇳' },
  { code: '880', country: 'Bangladesh', flag: '🇧🇩' },
  { code: '92', country: 'Pakistan', flag: '🇵🇰' },
  { code: '94', country: 'Sri Lanka', flag: '🇱🇰' },
  { code: '977', country: 'Nepal', flag: '🇳🇵' },
  { code: '95', country: 'Myanmar', flag: '🇲🇲' },
  { code: '968', country: 'Oman', flag: '🇴🇲' },
  { code: '974', country: 'Qatar', flag: '🇶🇦' },
  { code: '973', country: 'Bahrain', flag: '🇧🇭' },
  { code: '965', country: 'Kuwait', flag: '🇰🇼' },
];
