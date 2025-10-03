import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
    return (
        <nav>
            <ul>
                <li>
                    <Link to="/">Home</Link>
                </li>
                <li>
                    <Link to="/dashboard">Dashboard</Link>
                </li>
                <li>
                    <Link to="/profile">Profile</Link>
                </li>
                <li>
                    <Link to="/send-message">Send Message</Link>
                </li>
                <li>
                    <Link to="/receive-messages">Receive Messages</Link>
                </li>
            </ul>
        </nav>
    );
};

export default Navbar;