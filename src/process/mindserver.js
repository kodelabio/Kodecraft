import { createServer } from 'http';
import { Server } from 'socket.io';
import settings from '../../settings.js';

const port = settings.mindserver_port || 8080;
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

const agents = new Map();

io.on('connection', (socket) => {
    console.log(`[MindServer] Agent connected: ${socket.id}`);

    socket.on('login-agent', (name) => {
        agents.set(name, socket);
        console.log(`[MindServer] Agent '${name}' logged in`);
        io.emit('agents-update', Array.from(agents.keys()));
    });

    socket.on('get-settings', (name, callback) => {
        console.log(`[MindServer] Settings request from ${name}`);
        // Return agent settings from your config
        callback({ 
            settings: {
                agent_name: name,
                // Add any other settings agents need
            }
        });
    });

    socket.on('chat-message', (agentName, message) => {
        console.log(`[MindServer] Message from ${agentName}`);
    });

    socket.on('disconnect', () => {
        agents.forEach((s, name) => {
            if (s.id === socket.id) agents.delete(name);
        });
        io.emit('agents-update', Array.from(agents.keys()));
    });
});

httpServer.listen(port, () => {
    console.log(`[MindServer] ✓ Running on port ${port}`);
});