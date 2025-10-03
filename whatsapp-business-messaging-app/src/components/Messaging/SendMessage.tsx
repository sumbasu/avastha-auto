import React, { useState } from 'react';
import { sendMessage } from '../../services/whatsappService';

const SendMessage: React.FC = () => {
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await sendMessage(message);
            setMessage('');
        } catch (err) {
            setError('Failed to send message. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Send Message</h2>
            <form onSubmit={handleSendMessage}>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message here..."
                    required
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Sending...' : 'Send'}
                </button>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </form>
        </div>
    );
};

export default SendMessage;