import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import SendMessage from './components/Messaging/SendMessage';
import ReceiveMessages from './components/Messaging/ReceiveMessages';
import Navbar from './components/UI/Navbar';

const Routes = () => {
    return (
        <Router>
            <Navbar />
            <Switch>
                <Route path="/" exact component={Home} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/profile" component={Profile} />
                <Route path="/login" component={Login} />
                <Route path="/signup" component={Signup} />
                <Route path="/send-message" component={SendMessage} />
                <Route path="/receive-messages" component={ReceiveMessages} />
            </Switch>
        </Router>
    );
};

export default Routes;