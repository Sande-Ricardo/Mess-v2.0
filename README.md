# Mess - Secure Real-Time Messaging App

Mess is a highly secure, feature-rich real-time messaging application MVP built with modern web technologies. It is designed to provide seamless text, voice, and video communication while prioritizing security through End-to-End Encryption (E2EE) and robust real-time database rules.

## Key Features

### Security & Privacy

- **End-to-End Encryption (E2EE):** All 1-on-1 and group chat messages are encrypted natively in the browser using the Web Crypto API before ever reaching the servers.
- **Secure Architecture:** Firebase Realtime Database rules restrict unauthorized access at the node level, ensuring WebRTC signaling and message histories are strictly confined to participants.

### Messaging

- **1-on-1 & Group Chats:** Real-time text messaging with typing indicators, online/offline presence tracking, and read receipts.
- **Group Management:** Robust role-based access control (Admins/Members). Supports group creation, avatar uploads, member promotion/kick, and UUID-based invite links.
- **Voice Messages:** Native microphone integration utilizing the `MediaRecorder` and `Web Audio API`. Features an animated UI waveform while recording and a custom playback controller with variable speeds.

### WebRTC P2P Calling

- **Audio & Video Calls:** 1-on-1 direct peer-to-peer calling using native `RTCPeerConnection` with STUN server fallbacks.
- **Group Mesh Calls:** Scalable group voice calls utilizing a fully P2P Mesh Topology, seamlessly merging incoming audio tracks.
- **Dynamic UI:** Features an `@angular/cdk/drag-drop` draggable floating call window with local PIP (Picture-In-Picture) and an incoming call banner powered by the HTML5 Web Notifications API.

## Technology Stack

- **Frontend Framework:** Angular 19 (Standalone Components, Signals, RxJS)
- **Database & Signaling Server:** Firebase Realtime Database
- **Media Storage:** Cloudinary API
- **Native Web APIs:**
  - WebRTC (Audio/Video streams & P2P signaling)
  - Web Crypto API (E2EE)
  - MediaDevices & Web Audio API (Voice messaging)
  - Notifications API (Background ring alerts)
- **UI Utilities:** Angular CDK

## Project Structure

The project follows a modular, domain-driven design within `src/app/`:

```text
src/app/
├── core/
│   ├── models/       # TypeScript interfaces (User, Message, Group, etc.)
│   └── services/     # Heavy-lifting business logic
│       ├── auth.service.ts         # Firebase Authentication
│       ├── chat.service.ts         # Encrypted message delivery
│       ├── crypto.service.ts       # Web Crypto API handlers
│       ├── webrtc.service.ts       # 1v1 P2P Signaling
│       ├── group-call.service.ts   # Mesh Topology Networking
│       ├── voice-recorder.service.ts # MediaRecorder wrappers
│       └── cloudinary.service.ts   # Media uploads
└── features/
    └── chat/         # UI Components
        ├── call/                 # Draggable WebRTC Window
        ├── incoming-call/        # Web Notification Banner
        ├── chat-window/          # Main conversation interface
        ├── group-info/           # Group settings & members
        ├── voice-recorder/       # Animated recording UI
        └── voice-message/        # Custom audio player UI
```

## Application Architecture & Data Flow

The following diagram illustrates the integral functioning of the Mess application, detailing how the frontend services interact with the external backend infrastructure (Firebase, Cloudinary, and WebRTC STUN servers). 

It highlights the secure, end-to-end encrypted messaging loop and the peer-to-peer media streaming architecture:

```mermaid
graph TD
    %% Define styles
    classDef client fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef firebase fill:#ffe082,stroke:#ff8f00,stroke-width:2px;
    classDef crypto fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef webrtc fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef external fill:#fce4ec,stroke:#c2185b,stroke-width:2px;

    %% Client App
    subgraph Client Application ["Angular 19 Frontend"]
        UI["User Interface (Components)"]:::client
        Auth["Auth & Session Service"]:::client
        Chat["Chat Service"]:::client
        Crypt["Crypto Service (E2EE)"]:::crypto
        WebRTC["WebRTC Service"]:::webrtc
        Media["Media Services"]:::client
    end

    %% External Services
    subgraph Backend Infrastructure
        FBAuth[("Firebase Auth")]:::firebase
        RTDB[("Firebase RTDB")]:::firebase
        Cloudinary["Cloudinary Storage"]:::external
        STUN["STUN/TURN Servers"]:::external
    end

    %% Interactions
    UI -->|"1. Authenticate"| Auth
    Auth <-->|"Tokens & UID"| FBAuth
    
    UI -->|"2. Send Msg"| Chat
    Chat -->|"Encrypt"| Crypt
    Crypt -->|"Ciphertext"| Chat
    Chat -->|"Write"| RTDB
    
    RTDB -->|"Sync"| Chat
    Chat -->|"Decrypt"| Crypt
    Crypt -->|"Plaintext"| Chat
    Chat -->|"Update"| UI
    
    UI -->|"3. Attach Media"| Media
    Media -->|"Upload"| Cloudinary
    Cloudinary -->|"Secure URL"| Media
    Media -->|"Send as Msg"| Chat
    
    UI -->|"4. Start Call"| WebRTC
    WebRTC <-->|"Signaling (Offer/Answer/ICE)"| RTDB
    WebRTC <-->|"Network Path"| STUN
    WebRTC <.->|"Direct P2P Media Stream"| WebRTC
```

## Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Angular CLI](https://angular.dev/tools/cli) installed globally (`npm install -g @angular/cli`)
- A Firebase Project (with Realtime Database and Authentication enabled)
- A Cloudinary Account (for media uploads)

### 1. Clone & Install

```bash
git clone <repository-url>
cd mess
npm install
```

### 2. Environment Configuration

You must configure your backend environments before serving the app. Create or update your configuration files (e.g., `src/environments/environment.ts`) referencing the templates provided in the `/references` directory:

- Add your Firebase Config keys.
- Add your Cloudinary cloud name and upload presets.

### 3. Deploy Database Rules

Ensure your Firebase Realtime Database is secured by applying the provided `database.rules.json` file to your Firebase console. This secures the `/calls`, `/group-calls`, and `/messages` nodes.

### 4. Development Server

Run the local development server:

```bash
ng serve
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## License

This project is currently defined as an MVP implementation.
