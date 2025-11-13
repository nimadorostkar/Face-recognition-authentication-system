# Face Recognition Frontend

Next.js frontend for the Face Recognition Authentication System.

## Features

- Real-time webcam face recognition
- Automatic login when face is recognized
- Registration for new users
- Simple profile page
- Minimal, functional design

## Setup

1. Install dependencies:
```bash
npm install
```

2. Make sure the backend is running on `http://localhost:8000`

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:3000

## How It Works

1. **Home Page (/)**: 
   - Accesses your webcam
   - Continuously captures frames and sends to backend for recognition
   - If recognized: Auto-login and redirect to profile
   - If not recognized: Show registration form

2. **Profile Page (/profile)**:
   - Shows authenticated user information
   - Displays welcome message with username
   - Logout button

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Context API for state management
- Fetch API for backend communication

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with AuthProvider
│   │   ├── page.tsx            # Home page (login/register)
│   │   └── profile/
│   │       └── page.tsx        # Profile page
│   ├── components/
│   │   └── WebcamRecognition.tsx  # Webcam capture & recognition
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication state
│   └── lib/
│       └── api.ts              # API integration utilities
├── package.json
├── tsconfig.json
└── next.config.js
```

## API Integration

The app connects to the backend API at `http://localhost:8000`:

- `POST /recognize/` - Recognize face from image
- `POST /register/` - Register new user with face

## Notes

- No styling libraries used (minimal inline styles)
- Focus on functionality over design
- Webcam permission required
- Works best with good lighting

