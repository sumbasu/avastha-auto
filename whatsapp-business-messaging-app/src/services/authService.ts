import axios from 'axios';

const API_URL = 'https://your-backend-api.com/api/auth';

export const signup = async (userData) => {
    const response = await axios.post(`${API_URL}/signup`, userData);
    return response.data;
};

export const login = async (credentials) => {
    const response = await axios.post(`${API_URL}/login`, credentials);
    return response.data;
};

export const logout = async () => {
    const response = await axios.post(`${API_URL}/logout`);
    return response.data;
};