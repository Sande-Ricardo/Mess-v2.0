# Mess MVP - 7 Global Rules

1. **Language Specification:** Absolutely every aspect of the logic, variables, HTML inner-properties, components, paths, and comments MUST be written in 100% English.
2. **Aesthetics & Styling:** SCSS must be utilized dynamically via CSS Variables (`styles.scss`) ensuring a modern, glassmorphism-infused Dark Mode theme strictly based on the mock references. No hardcoded or generic CSS without variables.
3. **Standalone By Default:** Every new Angular component, pipe, or directive generated must use the `standalone: true` paradigm natively. Reusable logic belongs in the `/shared` or `/core` directories appropriately.
4. **RTDB Exclusivity:** Firebase Realtime Database is the core synchronization engine. Firestore API should NEVER be used.
5. **Security Base Rules:** The fundamental operational access is locked down: reads/writes are strictly authenticated and walled to `/users/{uid}`, with End-to-End Encryption acting universally across all private text layers.
6. **Fetch-Based Cloudinary:** The Cloudinary Cloud Storage limits strictly utilize the pure browser `fetch()` web API for unsigned media uploads returning `Observables`, maintaining slim bundle sizes over cumbersome Official SDKs.
7. **Progressive Agile Iterations:** The MVP develops strictly module by component progressively; no heavy refactoring chunks out-of-order blindly, moving step-by-step from base plumbing up to final user-interactivity.
