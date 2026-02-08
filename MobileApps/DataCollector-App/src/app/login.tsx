import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Mail, Lock, Eye, EyeOff, Building2, User, Key } from 'lucide-react-native';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [community, setCommunity] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async () => {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all required fields');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!isLogin && !name.trim()) {
      setError('Please fill in all required fields');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        const success = await login(email, password);
        if (!success) {
          setError('Invalid email or password');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        // Community field removed, passing empty string or default
        const result = await register(email, password, name, '', adminCode.trim() || undefined);
        if (!result.success) {
          setError(result.error || 'Registration failed');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setAdminCode('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#1f0a0a', '#3d1b1b', '#1f0a0a']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="items-center mb-10">
              <View className="w-20 h-20 rounded-3xl bg-pink-500/20 items-center justify-center mb-4">
                <Users size={40} color="#ec4899" />
              </View>
              <Text className="text-3xl font-bold text-white text-center">Community Data Entry</Text>
              <Text className="text-pink-300/70 mt-2 text-center">
                Community data management platform
              </Text>
            </View>

            <View className="space-y-4">
              {!isLogin && (
                <>
                  <View className="mb-4">
                    <Text className="text-pink-200/80 mb-2 ml-1 text-sm font-medium">Full Name</Text>
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 border border-pink-500/30">
                      <User size={20} color="#f9a8d4" />
                      <TextInput
                        className="flex-1 py-4 px-3 text-white text-base"
                        placeholder="Enter your full name"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>



                  <View className="mb-4">
                    <Text className="text-pink-200/80 mb-2 ml-1 text-sm font-medium">Admin Code (Optional)</Text>
                    <View className="flex-row items-center bg-white/10 rounded-xl px-4 border border-amber-500/30">
                      <Key size={20} color="#fbbf24" />
                      <TextInput
                        className="flex-1 py-4 px-3 text-white text-base font-mono tracking-widest"
                        placeholder="Enter if you have one"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={adminCode}
                        onChangeText={(text) => setAdminCode(text.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={8}
                      />
                    </View>
                    <Text className="text-amber-400/60 text-xs mt-1 ml-1">
                      Admin code lets you create communities
                    </Text>
                  </View>
                </>
              )}

              <View className="mb-4">
                <Text className="text-pink-200/80 mb-2 ml-1 text-sm font-medium">Email</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 border border-pink-500/30">
                  <Mail size={20} color="#f9a8d4" />
                  <TextInput
                    className="flex-1 py-4 px-3 text-white text-base"
                    placeholder="Enter your email"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-pink-200/80 mb-2 ml-1 text-sm font-medium">Password</Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 border border-pink-500/30">
                  <Lock size={20} color="#f9a8d4" />
                  <TextInput
                    className="flex-1 py-4 px-3 text-white text-base"
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                    {showPassword ? (
                      <EyeOff size={20} color="#f9a8d4" />
                    ) : (
                      <Eye size={20} color="#f9a8d4" />
                    )}
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View>
                  <Text className="text-red-400 text-center mb-4">{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={isLoading}
                className={cn(
                  'rounded-xl overflow-hidden mt-4',
                  isLoading && 'opacity-70'
                )}
              >
                <LinearGradient
                  colors={['#ec4899', '#ef4444']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 12 }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold text-base">
                      {isLogin ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-pink-200/60">
                  {isLogin ? "Don't have an account? " : 'Already have an account? '}
                </Text>
                <Pressable onPress={toggleMode} hitSlop={10}>
                  <Text className="text-pink-400 font-semibold">
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </Text>
                </Pressable>
              </View>

              {
                /*
                isLogin && (
                  
                  <View className="mt-8 p-4 bg-white/5 rounded-xl border border-pink-500/20">
                    <Text className="text-pink-200/60 text-center text-sm">
                      Demo credentials:{'\n'}
                      <Text className="text-pink-300">demo@community.com</Text> / <Text className="text-pink-300">demo123</Text>
                    </Text>
                  </View>
                  
                )
                  */
              }

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
