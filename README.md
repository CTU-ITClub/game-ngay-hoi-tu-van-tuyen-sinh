# 🎮 DVD Dodge Game — Camera Interactive

A real-time body-tracking dodge game powered by your webcam and MediaPipe Pose.

---

## 📦 Installation

```bash
pip install -r requirements.txt
```

> Python 3.9 – 3.11 recommended.

---

## ▶️ Run

```bash
python dvd_dodge_game.py
```

Press **Q** or **Esc** to quit at any time.

---

## 🕹️ How to Play

| Objective | Details |
|-----------|---------|
| **Dodge** | Move your whole body to avoid the bouncing DVD logo |
| **Collect** | Reach the glowing **yellow coins** to score points |
| **Survive** | You start with **3 lives** ❤️❤️❤️ — each DVD hit costs one |
| **Combo** | Collect coins quickly in a row for a **score multiplier** |

### Controls
| Key | Action |
|-----|--------|
| **Q / Esc** | Quit |
| **R** | Restart (on Game Over screen) |

---

## 📈 Progression

- A **new DVD logo** spawns every ~9 seconds (speed increases each level).
- Coins respawn **4 seconds** after collection.
- The skeleton overlay shows your **hitbox keypoints** in real time.

---

## ⚙️ Requirements

- A working webcam (720p or higher recommended)
- Good lighting so MediaPipe can detect your pose
- Stand ~1–2 m from the camera so your upper body is fully visible
