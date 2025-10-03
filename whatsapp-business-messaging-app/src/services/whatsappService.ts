import axios from 'axios';

const API_URL = 'https://api.whatsapp.com/v1'; // Replace with your actual WhatsApp Business API URL

export const sendMessage = async (messageData) => {
    try {
        const response = await axios.post(`${API_URL}/messages`, messageData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}` // Use your actual token
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Error sending message: ${error.response ? error.response.data : error.message}`);
    }
};

export const receiveMessages = async () => {
    try {
        const response = await axios.get(`${API_URL}/messages`, {
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}` // Use your actual token
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Error receiving messages: ${error.response ? error.response.data : error.message}`);
    }
};