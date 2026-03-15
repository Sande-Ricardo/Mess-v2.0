# Mess MVP - Architecture & Data Flow

## Data Flow Pipeline
All core state mutation and external API communication run through abstraction layers to keep UI components lean and easily testable.

### Flow: Component -> Service -> External Provider (Firebase/Cloudinary)

1. **Component (UI Layer)**
   * Manages user inputs and presentation logic.
   * Dispatches intent to inject services (`core/services/`).
   * Expects Observables or Signals to stream state updates back.
   * *Rule*: Components never import Firebase SDK or Cloudinary packages directly.

2. **Service (Business Logic Layer)**
   * Handlers for direct integration with backend platforms.
   * Example (Firebase): `FirebaseService` handles all `.ref()` and queries securely referencing current `uid`.
   * Example (Cloudinary): `CloudinaryService` acts as an HTTP client fetching and processing formData via the generic `fetch` browser API.
   * Normalizes incoming DTOs to standard internal Angular Models.

3. **External Provider (Backend Level)**
   * **Firebase RTDB**: Mutates real-time objects. Triggers callbacks. Protected heavily by native `database.rules.json`.
   * **Cloudinary**: Receives anonymous `POST` streams based on pre-established `upload_preset` credentials.
