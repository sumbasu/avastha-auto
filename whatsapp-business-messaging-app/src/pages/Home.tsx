import React from 'react';

const Home: React.FC = () => {
    return (
        <div>
            <h1>Welcome to the WhatsApp Business Messaging App</h1>
            <p>
                This application allows businesses to send and receive marketing or utility messages
                through their WhatsApp Business account. 
            </p>
            <h2>Features:</h2>
            <ul>
                <li>User account creation and authentication</li>
                <li>Send messages through WhatsApp Business API</li>
                <li>Receive incoming messages</li>
                <li>User-friendly interface</li>
            </ul>
        </div>
    );
};

export default Home;