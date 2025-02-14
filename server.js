// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://yahiko3665:eetuSCQWkENpxmEu@cluster0.fwchq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Basic User model
const User = mongoose.model('User', {
    collegeEmail: String,
    username: String,
    lastActive: Date
});

// Serve static files
app.use(express.static('public'));

// Store active users and their sockets
const activeUsers = new Map();
const waitingUsers = [];

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('register', async (data) => {
        try {
            const user = new User({
                collegeEmail: data.collegeEmail,
                username: data.username,
                lastActive: new Date()
            });
            await user.save();
            socket.userId = user._id;
            activeUsers.set(socket.userId.toString(), socket);
            socket.emit('registerSuccess', { username: user.username });
        } catch (err) {
            console.error('Registration error:', err);
            socket.emit('error', 'Registration failed');
        }
    });

    socket.on('findChat', () => {
        const userId = socket.userId?.toString();
        if (!userId || waitingUsers.includes(userId)) return;

        if (waitingUsers.length > 0) {
            const partnerId = waitingUsers.shift();
            const partnerSocket = activeUsers.get(partnerId);

            if (partnerSocket) {
                const roomId = `room_${Date.now()}`;
                socket.join(roomId);
                partnerSocket.join(roomId);
                socket.roomId = roomId;
                partnerSocket.roomId = roomId;
                
                io.to(roomId).emit('chatStarted', { roomId });
            }
        } else {
            waitingUsers.push(userId);
            socket.emit('waiting');
        }
    });

    socket.on('message', (data) => {
        if (!data.message || !data.roomId) return;
        io.to(data.roomId).emit('message', {
            userId: socket.userId,
            message: data.message,
            timestamp: new Date()
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        if (socket.roomId) {
            io.to(socket.roomId).emit('partnerDisconnected');
        }
        if (socket.userId) {
            activeUsers.delete(socket.userId.toString());
            const index = waitingUsers.indexOf(socket.userId.toString());
            if (index > -1) {
                waitingUsers.splice(index, 1);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
