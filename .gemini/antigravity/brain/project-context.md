# Mess MVP - Project Context

## Tech Stack
* **Frontend Framework**: Angular (LTS Vigente, Standalone Components default)
* **Realtime Database**: Firebase Realtime Database (RTDB) - exclusively RTDB (No Firestore)
* **Authentication**: Firebase Authentication (Email/SMS OTPs, Session Management, JWT)
* **Media Storage**: Cloudinary (Free Tier limit 25GB, Unsigned Upload via API)
* **Communications**: Native WebRTC (Voice/Video)
* **Styling**: SCSS (CSS variables based structure for dynamic theming)

## Folder Architecture
The Angular application follows a strict modular structure inside `src/app`:
* `core/`: Singleton services (`FirebaseService`, `CloudinaryService`), auth guards, HTTP interceptors, core models/types.
* `features/`: Smart, feature-specific modules (e.g., Auth, Global Chat, Settings, Contacts).
* `shared/`: Dumb, reusable pieces across features (`components/`, `directives/`, `pipes/`).

## Style Guidelines
* **Premium Aesthetics**: Dark mode default, vibrant purple/neon accents, rounded borders, glassmorphism, modern typography.
* **SCSS Variables**: All color palettes, sizing, and fonts strictly defined and consumed as CSS Variables in `styles.scss`.
* **English Codebase**: Entire codebase (files, classes, functions, variable names, comments, docblocks) is 100% written in English.
