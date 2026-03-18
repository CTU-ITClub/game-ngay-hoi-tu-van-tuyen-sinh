import cv2
import numpy as np
import random
import time
import math
import sys
import json
import os
import tkinter as tk
from tkinter import simpledialog

# ── Mediapipe import ──────────────────────
def _import_mediapipe():
    try:
        from mediapipe.solutions import pose           as p
        from mediapipe.solutions import drawing_utils  as d
        from mediapipe.solutions import drawing_styles as s
        return p, d, s
    except Exception: pass
    try:
        import mediapipe as mp
        return mp.solutions.pose, mp.solutions.drawing_utils, mp.solutions.drawing_styles
    except Exception: pass
    try:
        from mediapipe.python.solutions import pose           as p
        from mediapipe.python.solutions import drawing_utils  as d
        from mediapipe.python.solutions import drawing_styles as s
        return p, d, s
    except Exception: pass

    print("\n[ERROR] Cannot import mediapipe.solutions.")
    sys.exit(1)

_pose_mod, _draw_mod, _styles_mod = _import_mediapipe()

# ─────────────────────────────────────────────
#  CONSTANTS & CONFIG
# ─────────────────────────────────────────────
WIN_NAME     = "Hanh Trinh Vao Dai Hoc Can Tho"
MAX_HP       = 10
BASE_SPEED   = 5.0
SPEED_INC    = 0.8
LEVEL_EVERY  = 5
HIT_COOLDOWN = 60 # Thời gian bất tử tạm thời sau khi bị trừ máu

# Các điểm trên cơ thể dùng để xét va chạm (mũi, vai, tay, hông...)
HITBOX_IDS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26]

GOOD_TYPES = [
    {"name": "Ngu 8 tieng", "color": (50, 200, 50), "heal": 1, "pts": 10},
    {"name": "The duc", "color": (255, 150, 0), "heal": 1, "pts": 15},
    {"name": "Diem 10", "color": (255, 255, 0), "heal": 2, "pts": 30}
]

BAD_TYPES = [
    {"name": "Thuc khuya", "color": (0, 0, 255), "dmg": 2},
    {"name": "Game 180p", "color": (0, 100, 255), "dmg": 3},
    {"name": "Cup hoc", "color": (150, 0, 150), "dmg": 4}
]

LEADERBOARD_FILE = "leaderboard.json"

def load_leaderboard():
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, "r") as f: return json.load(f)
        except: pass
    return []

def save_score(name, score):
    lb = load_leaderboard()
    lb.append({"name": name, "score": score})
    lb = sorted(lb, key=lambda x: x["score"], reverse=True)[:5]
    with open(LEADERBOARD_FILE, "w") as f: json.dump(lb, f)
    return lb

def draw_leaderboard(frame, lb):
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (w//2-220, h//2+50), (w//2+220, h//2+300), (0,0,0), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
    cv2.putText(frame, "--- TOP 5 LEADERBOARD ---", (w//2-180, h//2+90), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2, cv2.LINE_AA)
    y_offset = h//2 + 130
    if not lb:
        cv2.putText(frame, "Chua co du lieu", (w//2-80, y_offset), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2, cv2.LINE_AA)
    else:
        for i, entry in enumerate(lb):
            text = f"{i+1}. {entry['name']} - {entry['score']} pts"
            cv2.putText(frame, text, (w//2-150, y_offset), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
            y_offset += 35

# ─────────────────────────────────────────────
#  GAME OBJECTS
# ─────────────────────────────────────────────
class BadItem:
    def __init__(self, fw, fh, speed):
        self.fw, self.fh = fw, fh
        self.r = 45
        self.x = float(random.randint(self.r, fw-self.r))
        self.y = float(random.randint(self.r, fh-self.r))
        angle  = random.uniform(20, 70)
        self.vx = math.cos(math.radians(angle)) * speed * random.choice([-1,1])
        self.vy = math.sin(math.radians(angle)) * speed * random.choice([-1,1])
        
        self.type = random.choice(BAD_TYPES)
        self.name = self.type["name"]
        self.color = self.type["color"]
        self.dmg = self.type["dmg"]

    def set_speed(self, new_speed):
        cur = math.hypot(self.vx, self.vy)
        if cur > 0:
            self.vx *= (new_speed / cur); self.vy *= (new_speed / cur)

    def update(self):
        self.x += self.vx; self.y += self.vy
        if self.x - self.r <= 0: self.x = self.r; self.vx = abs(self.vx)
        if self.x + self.r >= self.fw: self.x = self.fw-self.r; self.vx = -abs(self.vx)
        if self.y - self.r <= 0: self.y = self.r; self.vy = abs(self.vy)
        if self.y + self.r >= self.fh: self.y = self.fh-self.r; self.vy = -abs(self.vy)

    def draw(self, frame):
        cx, cy = int(self.x), int(self.y)
        cv2.circle(frame, (cx, cy), self.r, self.color, -1)
        cv2.circle(frame, (cx, cy), self.r, (255,255,255), 2)
        font = cv2.FONT_HERSHEY_SIMPLEX
        (tw, th), _ = cv2.getTextSize(self.name, font, 0.5, 2)
        cv2.putText(frame, self.name, (cx-tw//2, cy-10), font, 0.5, (255,255,255), 2, cv2.LINE_AA)
        (tw2, th2), _ = cv2.getTextSize(f"-{self.dmg} HP", font, 0.5, 2)
        cv2.putText(frame, f"-{self.dmg} HP", (cx-tw2//2, cy+15), font, 0.5, (200,200,200), 2, cv2.LINE_AA)

class GoodItem:
    def __init__(self, fw, fh):
        self.fw, self.fh = fw, fh
        self.r = 35
        self._place()

    def _place(self):
        self.x = random.randint(80, self.fw-80)
        self.y = random.randint(80, self.fh-80)
        self.alive = True
        self.death_time = 0.0
        self.phase = random.uniform(0, math.pi*2)
        
        self.type = random.choice(GOOD_TYPES)
        self.name = self.type["name"]
        self.color = self.type["color"]
        self.heal = self.type["heal"]
        self.pts = self.type["pts"]

    def respawn_if_ready(self, now):
        if not self.alive and now - self.death_time >= random.uniform(2.0, 4.0):
            self._place()

    def draw(self, frame, now):
        if not self.alive: return
        pulse = int(3 * math.sin(now*4 + self.phase))
        curr_r = self.r + pulse
        cv2.circle(frame, (self.x, self.y), curr_r, self.color, -1)
        cv2.circle(frame, (self.x, self.y), curr_r, (255,255,255), 2)
        font = cv2.FONT_HERSHEY_SIMPLEX
        (tw, th), _ = cv2.getTextSize(self.name, font, 0.5, 2)
        cv2.putText(frame, self.name, (self.x-tw//2, self.y+5), font, 0.5, (0,0,0), 2, cv2.LINE_AA)

    def check_collect(self, points):
        if not self.alive: return False
        for px, py in points:
            if math.hypot(px-self.x, py-self.y) < self.r + 20: return True
        return False

class FloatingText:
    def __init__(self, x, y, text, color=(0,255,180)):
        # Đảm bảo x, y luôn là số nguyên để không bị crash
        self.x, self.y = int(x), int(y)
        self.text = text
        self.color = color
        self.life = 45

    def update(self): 
        self.y -= 2
        self.life -= 1

    def draw(self, frame):
        a = max(0.0, self.life / 45.0)
        ov = frame.copy()
        cv2.putText(ov, self.text, (self.x, self.y), cv2.FONT_HERSHEY_SIMPLEX, 1.0, self.color, 3, cv2.LINE_AA)
        cv2.addWeighted(ov, a, frame, 1-a, 0, frame)

# ─────────────────────────────────────────────
#  HUD
# ─────────────────────────────────────────────
def draw_hud(frame, score, hp, elapsed, level, player_name):
    h, w = frame.shape[:2]
    # Thanh nền đen
    cv2.rectangle(frame, (0,0), (w, 60), (30,30,30), -1)

    # Vẽ thanh HP (Health Bar)
    cv2.putText(frame, "HP:", (20, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2, cv2.LINE_AA)
    bar_w = 200
    cv2.rectangle(frame, (70, 20), (70 + bar_w, 45), (60,60,60), -1) # Nền thanh máu
    
    hp_percent = max(0, hp) / MAX_HP
    hp_color = (0, 255, 0) if hp > 5 else ((0, 255, 255) if hp > 2 else (0, 0, 255))
    cv2.rectangle(frame, (70, 20), (70 + int(bar_w * hp_percent), 45), hp_color, -1)
    cv2.rectangle(frame, (70, 20), (70 + bar_w, 45), (255,255,255), 2) # Viền thanh máu
    cv2.putText(frame, f"{hp}/{MAX_HP}", (70 + bar_w + 15, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.8, hp_color, 2, cv2.LINE_AA)

    # Thông tin khác
    cv2.putText(frame, f"{player_name} | Score: {score}", (w//2-80, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2, cv2.LINE_AA)
    cv2.putText(frame, f"Level {level}  |  {elapsed}s", (w-280, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (200,230,255), 2, cv2.LINE_AA)

# ─────────────────────────────────────────────
#  MAIN LOOP
# ─────────────────────────────────────────────
def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    ret, _ = cap.read()
    if not ret: print("Cannot open webcam."); return

    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    pose = _pose_mod.Pose(
        model_complexity=1, min_detection_confidence=0.5,
        min_tracking_confidence=0.5, smooth_landmarks=True,
    )

    def new_game():
        return {
            "bad_items": [BadItem(fw, fh, BASE_SPEED)], 
            "good_items": [GoodItem(fw, fh) for _ in range(3)], 
            "score": 0, "hp": MAX_HP, "hit_cd": 0,
            "start": time.time(), "level": 1, "cur_speed": BASE_SPEED,
            "next_lv_t": LEVEL_EVERY, "floats": [], "game_over": False
        }

    state = "INPUT_NAME"
    player_name = "HocSinh12"
    leaderboard_data = []
    g = None

    while True:
        ret, frame = cap.read()
        if not ret: break
        frame = cv2.flip(frame, 1)
        now = time.time()
        
        key = cv2.waitKey(1) & 0xFF

        # MÀN HÌNH NHẬP TÊN
        if state == "INPUT_NAME":
            root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)
            user_input = simpledialog.askstring("Hanh Trinh CTU", "Nhap ten thi sinh:", parent=root)
            root.destroy()
            if user_input is None: break # Bấm Cancel thì thoát game
            player_name = user_input.strip() or "Guest"
            state = "PLAYING"
            g = new_game()
            continue

        # Lấy khung hình và đẩy vào Mediapipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)
        hitbox_pts = []

        if results.pose_landmarks:
            lms = results.pose_landmarks.landmark
            _draw_mod.draw_landmarks(frame, results.pose_landmarks, _pose_mod.POSE_CONNECTIONS)
            for idx in HITBOX_IDS:
                lm = lms[idx]
                if lm.visibility > 0.45:
                    px, py = int(lm.x*fw), int(lm.y*fh)
                    hitbox_pts.append((px, py))
                    cv2.circle(frame, (px, py), 9, (50,255,120), -1)

        # MÀN HÌNH GAME OVER
        if state == "GAME_OVER":
            elapsed = int(now - g["start"])
            ov = frame.copy(); cv2.rectangle(ov, (0,0), (fw,fh), (0,0,0), -1)
            cv2.addWeighted(ov, 0.6, frame, 0.4, 0, frame)
            
            cv2.putText(frame, "GAME OVER!", (fw//2-300, fh//2-60),
                        cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0,50,255), 6, cv2.LINE_AA)
            cv2.putText(frame, f"Score: {g['score']} | Time: {elapsed}s", (fw//2-180, fh//2+20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255,255,255), 2, cv2.LINE_AA)
            cv2.putText(frame, "R = Thi lai  |  Q = Thoat", (fw//2-200, fh//2+380),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (100,255,200), 2, cv2.LINE_AA)
            
            draw_leaderboard(frame, leaderboard_data)
            cv2.imshow(WIN_NAME, frame)
            
            if key in (ord('r'), ord('R')): state = "INPUT_NAME"
            elif key in (ord('q'), ord('Q'), 27): break
            continue

        # MÀN HÌNH ĐANG CHƠI (PLAYING)
        if key in (27, ord('q'), ord('Q')): break
        
        elapsed = int(now - g["start"])

        # Level Up
        if elapsed >= g["next_lv_t"]:
            g["level"] += 1; g["next_lv_t"] += LEVEL_EVERY; g["cur_speed"] += SPEED_INC
            for b in g["bad_items"]: b.set_speed(g["cur_speed"])
            g["bad_items"].append(BadItem(fw, fh, g["cur_speed"]))
            g["floats"].append(FloatingText(fw//2-160, fh//2, f"LEVEL {g['level']}! Nguy hiem hon!", (0, 100, 255)))

        # Cập nhật và vẽ vật phẩm
        for c in g["good_items"]:
            c.respawn_if_ready(now); c.draw(frame, now)
            
        for b in g["bad_items"]:
            b.update(); b.draw(frame)

        # Va chạm Vật phẩm Tốt
        for c in g["good_items"]:
            if c.check_collect(hitbox_pts):
                c.alive = False; c.death_time = now
                g["score"] += c.pts
                g["hp"] = min(MAX_HP, g["hp"] + c.heal)
                g["floats"].append(FloatingText(int(c.x), int(c.y), f"+{c.heal} HP", (0,255,0)))

        # Va chạm Vật phẩm Xấu
        if g["hit_cd"] <= 0 and hitbox_pts:
            for b in g["bad_items"]:
                hit = False
                for px, py in hitbox_pts:
                    if math.hypot(px-b.x, py-b.y) < b.r + 15:
                        hit = True; break
                
                if hit:
                    g["hp"] -= b.dmg
                    g["hit_cd"] = HIT_COOLDOWN 
                    # Đã bọc int() vào tọa độ để sửa lỗi Crash
                    g["floats"].append(FloatingText(int(b.x), int(b.y), f"-{b.dmg} ({b.name})", (0,0,255)))
                    
                    if g["hp"] <= 0:
                        state = "GAME_OVER"
                        leaderboard_data = save_score(player_name, g["score"])
                    break

        # Hiệu ứng màn hình đỏ khi mất máu
        if g["hit_cd"] > 0:
            g["hit_cd"] -= 1
            if g["hit_cd"] % 10 < 5:
                ov = frame.copy(); cv2.rectangle(ov, (0,0), (fw,fh), (0,0,200), -1)
                cv2.addWeighted(ov, 0.2, frame, 0.8, 0, frame)

        # Cập nhật Text nổi
        g["floats"] = [ft for ft in g["floats"] if ft.life > 0]
        for ft in g["floats"]: ft.update(); ft.draw(frame)

        draw_hud(frame, g["score"], g["hp"], elapsed, g["level"], player_name)

        if not results.pose_landmarks:
            cv2.putText(frame, "Buoc vao camera di!", (fw//2-190, fh//2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.95, (0,165,255), 2, cv2.LINE_AA)

        cv2.imshow(WIN_NAME, frame)

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()