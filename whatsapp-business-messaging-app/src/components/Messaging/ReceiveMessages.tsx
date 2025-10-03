import React, { useEffect, useState } from 'react';
import { receiveMessages } from '../../services/whatsappService';
import { Message } from '../../types';

const ReceiveMessages: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const incomingMessages = await receiveMessages();
                setMessages(incomingMessages);
            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        };

        fetchMessages();
        const interval = setInterval(fetchMessages, 5000); // Fetch messages every 5 seconds

        return () => clearInterval(interval); // Cleanup on unmount
    }, []);

    return (
        <div>
            <h2>Incoming Messages</h2>
            <ul>
                {messages.map((message) => (
                    <li key={message.id}>
                        <strong>From:</strong> {message.sender} <br />
                        <strong>Message:</strong> {message.content} <br />
                        <strong>Received At:</strong> {new Date(message.timestamp).toLocaleString()}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ReceiveMessages;