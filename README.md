# Real-Time Collaborative Drawing Canvas

A multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization.
Deployment(link):`collaborative-drawing-82adb.up.railway.app`

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd collaborative-canvas
```

2. Install dependencies:

```bash
npm install
```

3. Build the TypeScript code:

```bash
npm run build
```

4. Start the server:

```bash
npm start
```

The application will be available at `http://localhost:3000`

### Using New Features

#### Saving a Drawing Session

1. Click the **"💾 Save Session"** button in the toolbar
2. Enter a name for your session when prompted
3. Your canvas state will be saved to the server

#### Loading a Drawing Session

1. Click the **"📂 Load Session"** button in the toolbar
2. Browse the list of saved sessions
3. Click on a session to load it (syncs to all connected users)

#### Performance Metrics

- **FPS Counter**: Displays real-time frames per second in the Performance section
- **Latency Display**: Shows WebSocket connection latency in milliseconds
- Both metrics update automatically and use color coding for quick status checks

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

## 🧪 Testing with Multiple Users

1. **Open multiple browser windows/tabs** or use different devices on the same network
2. Navigate to `http://localhost:3000` in each window
3. Start drawing in one window - you should see the drawing appear in real-time in all other windows
4. Try drawing simultaneously from multiple windows to test conflict resolution
5. Test undo/redo functionality - actions should be synchronized across all users

### Testing Checklist

- ✅ Real-time drawing synchronization
- ✅ Multiple users drawing simultaneously
- ✅ Cursor position indicators for other users
- ✅ Undo/redo works globally
- ✅ Tool switching (brush/eraser)
- ✅ Color and brush size changes
- ✅ User list updates when users join/leave
- ✅ Save and load drawing sessions
- ✅ Performance metrics display (FPS and latency)
- ✅ Clear canvas syncs across all users

## 📁 Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html          # Main HTML structure
│   ├── style.css           # Styling
│   ├── canvas.js           # Canvas drawing logic
│   ├── websocket.js        # WebSocket client
│   ├── main.js             # App initialization
│   ├── performance.js      # Performance metrics (FPS, latency)
│   └── session-manager.js  # Session save/load functionality
├── server/
│   ├── server.ts           # Express + WebSocket server
│   ├── rooms.ts            # Room management
│   └── drawing-state.ts    # Canvas state management
├── sessions/               # Saved drawing sessions (auto-created)
├── package.json
├── tsconfig.json
├── README.md
└── ARCHITECTURE.md
```

## 🎨 Features

### Core Features

- **Real-time Drawing**: See other users' drawings as they draw (not after they finish)
- **Multiple Tools**: Brush and eraser with customizable colors and stroke width
- **User Indicators**: Visual cursor positions showing where other users are drawing
- **Global Undo/Redo**: Undo/redo operations synchronized across all users
- **User Management**: See who's online with color-coded user badges
- **Conflict Resolution**: Handles simultaneous drawing in overlapping areas
- **Drawing Persistence**: Save and load drawing sessions to continue work later
- **Performance Metrics**: Real-time FPS counter and latency display with color-coded indicators

### Session Management

- **Save Sessions**: Save your current canvas state with a custom name
- **Load Sessions**: Browse and load previously saved drawing sessions
- **Session List**: View all saved sessions with timestamps
- **Auto-sync**: Loaded sessions automatically sync across all connected users

### Performance Monitoring

- **FPS Counter**: Real-time frames per second display
  - 🟢 Green: ≥55 FPS (excellent)
  - 🟠 Orange: 30-54 FPS (good)
  - 🔴 Red: <30 FPS (needs optimization)
- **Latency Display**: WebSocket connection latency in milliseconds
  - 🟢 Green: <50ms (excellent)
  - 🟠 Orange: 50-149ms (good)
  - 🔴 Red: ≥150ms (high latency)

### Technical Features

- **Vanilla JavaScript**: No frontend frameworks - pure DOM/Canvas API
- **WebSocket Communication**: Real-time bidirectional communication using Socket.io
- **Efficient Canvas Operations**: Optimized path drawing and redrawing
- **State Synchronization**: Server-side state management for consistency
- **Mobile Support**: Touch events for drawing on mobile devices
- **File-based Persistence**: Sessions saved as JSON files on the server
- **RESTful API**: REST endpoints for session management

## 🐛 Known Limitations

1. **Single Room**: Currently supports one default room (room system is implemented but not exposed in UI)
2. **No Authentication**: Users are identified by socket ID only
3. **Limited Undo History**: Undo stack is in-memory only
4. **No Drawing Export**: Cannot save/export drawings as images (PNG/JPG export)
5. **Performance**: May experience lag with 10+ simultaneous users drawing heavily
6. **Session Storage**: Sessions are stored as files on the server (not in a database)

## 🆕 Recent Updates

### Version 2.0 - Enhanced Features

- ✨ **Drawing Persistence**: Save and load drawing sessions
- 📊 **Performance Metrics**: Real-time FPS counter and latency monitoring
- 🎨 **Enhanced UI**: Modern styling with gradients, improved layout, and better visual feedback
- 🔄 **Improved Clear**: Clear canvas now syncs across all users
- 📁 **Session Management**: Browse and manage saved drawing sessions

## ⏱️ Time Spent

- **Initial Setup**: 1 hour
- **Backend Implementation**: 3 hours
- **Frontend Implementation**: 4 hours
- **Real-time Synchronization**: 2 hours
- **Undo/Redo System**: 2 hours
- **UI/UX Polish**: 1.5 hours
- **Testing & Bug Fixes**: 1.5 hours
- **Documentation**: 1 hour
- **Session Persistence**: 2 hours
- **Performance Metrics**: 1.5 hours
- **UI Enhancements**: 1.5 hours

**Total**: ~21 hours

## 🔧 Troubleshooting

### Server won't start

- Ensure port 3000 is not already in use
- Check that all dependencies are installed: `npm install`
- Verify TypeScript compilation: `npm run build`

### Drawings not syncing

- Check browser console for WebSocket connection errors
- Verify server is running and accessible
- Check network connectivity between clients and server

### Canvas not displaying

- Check browser console for JavaScript errors
- Ensure all client files are being served correctly
- Verify canvas element exists in DOM

### Session save/load not working

- Ensure the `sessions/` directory exists and is writable
- Check server console for file system errors
- Verify API endpoints are accessible: `/api/save-session`, `/api/load-session`, `/api/sessions`

### Performance metrics not showing

- Ensure JavaScript console has no errors
- Check WebSocket connection is established (connection indicator should be green)
- Verify `performance.js` is loaded correctly

## 📝 License

MIT

## 👤 Author

Built as a technical assignment demonstrating real-time collaborative application development.
