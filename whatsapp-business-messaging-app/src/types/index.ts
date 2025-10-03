export interface User {
    id: string;
    username: string;
    email: string;
    createdAt: Date;
}

export interface Message {
    id: string;
    senderId: string;
    recipientId: string;
    content: string;
    timestamp: Date;
}

export interface AuthResponse {
    token: string;
    user: User;
}