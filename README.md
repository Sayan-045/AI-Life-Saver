# ⚡ Life Saver

> **Because deadlines shouldn't be disasters.**

An AI-powered deadline rescue companion that **predicts missed deadlines before they happen** and automatically generates personalized rescue plans using **Google Gemini AI**.

---

## 🚀 Live Demo

🌐 https://life-saver-362351694101.asia-east1.run.app

---

## 📌 Problem

Students, professionals, and entrepreneurs miss deadlines every day—not because they forget, but because existing productivity tools only send passive reminders.

Traditional to-do apps tell users **what is due**.

Life Saver tells users **what to do next**.

---

## 💡 Solution

Life Saver continuously monitors tasks, predicts deadline risks, and proactively intervenes before it's too late.

Instead of waiting for users to ask for help, the AI automatically:

- Predicts risky deadlines
- Generates rescue plans
- Prioritizes tasks
- Breaks large tasks into smaller steps
- Creates realistic daily schedules

The result is an AI assistant that helps users finish work rather than simply reminding them about it.

---

# ✨ Features

## 🚨 AI Crisis Mode

Automatically activates when:

- Deadline is within 30 minutes
- Estimated completion time exceeds remaining time

Gemini instantly generates:

- Rescue strategy
- Priority list
- What to skip
- Whether to request an extension

---

## 🔮 Proactive Crisis Prediction

Every time the dashboard opens, Gemini analyzes every pending task and predicts which deadlines are likely to be missed before they become emergencies.

---

## 🎯 Smart Task Prioritization

Tasks are ranked using an urgency score based on:

- Priority
- Remaining time
- Estimated effort

The most important task is always shown first.

---

## 🧩 Smart Task Breakdown

Large tasks can be automatically divided into smaller actionable subtasks using Gemini.

---

## 🤖 AI Rescue Plans

Every task includes an **AI Help** button.

Gemini creates a customized rescue strategy based on:

- Task
- Deadline
- Remaining time

---

## 🎤 Voice Task Entry

Simply say:

> "Submit assignment tomorrow 5 PM high priority"

Gemini extracts:

- Task
- Deadline
- Priority
- Estimated duration

---

## 📅 Smart Daily Schedule

Generates an optimized hour-by-hour plan for the day using AI.

---

## 📬 Gmail Integration (Demo)

Detects deadline-related emails and automatically creates tasks.

(Currently demonstrated in demo mode.)

---

## 📈 Productivity Score

Tracks productivity using:

- Task completion
- Habit streaks
- On-time completion

Gemini also provides motivational coaching.

---

## 📆 Calendar View

Weekly calendar with color-coded priorities.

---

## 🛠 Tech Stack

### Frontend

- React 18
- Vite
- Tailwind CSS
- Framer Motion

### Backend

- Node.js
- Express

### AI

- Google Gemini 1.5 Flash
- Groq Llama 3 (Fallback)

### Database

- Cloud Firestore

### Authentication

- Firebase Authentication

### Deployment

- Docker
- Google Cloud Run

---

# 🏗 Architecture

```
                 User
                  │
                  ▼
          React Frontend
                  │
        Firebase Authentication
                  │
                  ▼
          Cloud Firestore
                  │
                  ▼
          Express Backend
            │          │
            ▼          ▼
      Gemini AI     Groq AI
        (Primary)   (Fallback)
```

---

# 🔄 Workflow

```
User opens app
        │
        ▼
Google Sign-In
        │
        ▼
Tasks load from Firestore
        │
        ▼
Gemini analyzes deadlines
        │
        ▼
Risk Predictions
        │
        ▼
User adds tasks
        │
        ▼
Urgency score updates
        │
        ▼
Crisis Mode (if needed)
        │
        ▼
AI Rescue Plan
        │
        ▼
Task Completed
        │
        ▼
Productivity Score Updated
```

---

# 📸 Screenshots

| Dashboard | Crisis Mode |
|-----------|-------------|
| *(Add Screenshot)* | *(Add Screenshot)* |

| AI Chat | Calendar |
|----------|----------|
| *(Add Screenshot)* | *(Add Screenshot)* |

| Habit Tracker | Productivity Score |
|----------------|--------------------|
| *(Add Screenshot)* | *(Add Screenshot)* |

---

# 🌟 What Makes Life Saver Different?

✅ AI acts **without waiting for prompts**

✅ Predicts missed deadlines

✅ Generates personalized rescue plans

✅ Multi-AI fallback system

✅ Voice-powered task creation

✅ Real-time productivity tracking

---

# 🚀 Future Roadmap

- Google Calendar Integration
- Gmail OAuth Verification
- SMS Crisis Alerts
- Team Collaboration
- AI Weekly Reports
- React Native Mobile App

---

# 👨‍💻 Built With

- Google Gemini AI
- Firebase
- Cloud Firestore
- Google Cloud Run
- React
- Node.js

---

# 📄 License

MIT License

---

## ⭐ If you like this project, consider giving it a star!

**Life Saver ⚡**

**Because deadlines shouldn't be disasters.**
