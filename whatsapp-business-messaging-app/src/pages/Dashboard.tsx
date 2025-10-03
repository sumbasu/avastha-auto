import React from 'react';
import { useEffect, useState } from 'react';
import { getUserStats } from '../services/whatsappService';
import { UserStats } from '../types';

const Dashboard: React.FC = () => {
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserStats = async () => {
            try {
                const stats = await getUserStats();
                setUserStats(stats);
            } catch (error) {
                console.error('Error fetching user stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUserStats();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Dashboard</h1>
            {userStats ? (
                <div>
                    <h2>Your Messaging Statistics</h2>
                    <p>Total Messages Sent: {userStats.totalMessagesSent}</p>
                    <p>Total Messages Received: {userStats.totalMessagesReceived}</p>
                    <p>Last Message Sent: {userStats.lastMessageSent}</p>
                </div>
            ) : (
                <p>No statistics available.</p>
            )}
        </div>
    );
};

export default Dashboard;