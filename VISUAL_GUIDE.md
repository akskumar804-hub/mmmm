# Visual Guide: UI Changes

## Admin Exam Builder - New Features

### BEFORE (Old Exam Builder)

```
┌─────────────────────────────────────────────────┐
│ Exam Settings                                   │
├─────────────────────────────────────────────────┤
│ Exam Title:      [My Exam               ]      │
│ Duration (min):  [30                    ]      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Add Question                                    │
├─────────────────────────────────────────────────┤
│ Question Type:   [MCQ               ▼]         │
│ Question Text:   [                        ]   │
│ ... more fields ...                            │
│                      [Add Question]            │
└─────────────────────────────────────────────────┘

                    [Create Exam]
```

### AFTER (New Exam Builder with Features)

```
┌─────────────────────────────────────────────────┐
│ Exam Settings                                   │
├─────────────────────────────────────────────────┤
│ Exam Title:      [My Final Exam         ]      │
│ Duration (min):  [90                    ]      │
│ Exam Type:       [Mixed Types           ▼]    │ ← NEW!
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Question Type Configuration             ← NEW! │
├─────────────────────────────────────────────────┤
│ Multiple Choice Questions:    [5   ]           │
│ Fill in the Blanks:           [3   ]           │
│ Free Text Questions:          [2   ]           │
│                                                 │
│ Total Questions: 10                            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Proctoring Settings                     ← NEW! │
├─────────────────────────────────────────────────┤
│ ☑ Proctoring Required                          │
│                                                 │
│   Proctoring Mode:                             │
│   ⦿ Basic (Screen monitoring only)             │
│   ○ Webcam (Video required)                    │
│                                                 │
│   ☑ Require Screen Sharing                    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Add Question                                    │
├─────────────────────────────────────────────────┤
│ Question Type:   [MCQ               ▼]         │
│ Question Text:   [                        ]   │
│ ... more fields ...                            │
│                      [Add Question]            │
└─────────────────────────────────────────────────┘

                    [Create Exam]
```

---

## Admin: Exam Type Options

### Single Type Exams

```
Exam Type: ▼

[✓] Multiple Choice Only
[ ] Fill in the Blanks Only
[ ] Free Text Only
[ ] Mixed Types

Result: Only MCQ questions expected
```

### Mixed Type Exam

```
Exam Type: ▼

[ ] Multiple Choice Only
[ ] Fill in the Blanks Only
[ ] Free Text Only
[✓] Mixed Types

Result: Shows Question Type Configuration section
```

---

## Admin: Proctoring Settings Examples

### Example 1: No Proctoring

```
☐ Proctoring Required

[Proctoring Mode hidden]
[Screenshare hidden]

Result: Student can take exam without any monitoring
```

### Example 2: Basic Proctoring Only

```
☑ Proctoring Required

Proctoring Mode:
[✓] Basic (Screen monitoring only)
[ ] Webcam (Video required)

☐ Require Screen Sharing

Result: Screen monitored but no webcam/screenshare needed
```

### Example 3: Full Proctoring (Webcam + Screen Share)

```
☑ Proctoring Required

Proctoring Mode:
[ ] Basic (Screen monitoring only)
[✓] Webcam (Video required)

☑ Require Screen Sharing

Result: Student must show face AND screen
```

### Example 4: Webcam Only (No Mandatory Screen Share)

```
☑ Proctoring Required

Proctoring Mode:
[ ] Basic (Screen monitoring only)
[✓] Webcam (Video required)

☐ Require Screen Sharing

Result: Video required but screenshare is optional
```

---

## Student Exam Attempt - Changes

### BEFORE (Old Student Exam Page)

```
╔════════════════════════════════════╗
║ Start Exam (Single Login)          ║
╠════════════════════════════════════╣
║                                    ║
║ Select Proctoring Mode:            ║
║ ⦿ Basic                            ║
║ ○ Webcam                           ║
║                                    ║
║ ☑ Screen share (optional)          ║
║                                    ║
║ Rules: Fullscreen required...      ║
║                                    ║
║                [Start Exam]        ║
╚════════════════════════════════════╝
```

→ **Students choose their own proctoring level!**

### AFTER (New Student Exam Page)

```
╔════════════════════════════════════╗
║ Start Exam (Single Login)          ║
╠════════════════════════════════════╣
║                                    ║
║ ⓘ Proctoring Required:            ║
║   Your instructor requires         ║
║   proctoring for this exam.        ║
║   Webcam will be required.         ║
║   Screen sharing is also required. ║
║                                    ║
║ Rules: Fullscreen required...      ║
║                                    ║
║              [Start Exam]          ║
╚════════════════════════════════════╝
```

→ **Admin-configured requirements only. No student choices.**

---

## Student Views Different Exam Types

### Exam 1: No Proctoring

```
╔════════════════════════════════════╗
║ Start Exam (Single Login)          ║
╠════════════════════════════════════╣
║                                    ║
║ Rules: Fullscreen required...      ║
║                                    ║
║              [Start Exam]          ║
╚════════════════════════════════════╝
```

### Exam 2: Basic Proctoring Only

```
╔════════════════════════════════════╗
║ Start Exam (Single Login)          ║
╠════════════════════════════════════╣
║                                    ║
║ ⓘ Proctoring Required:            ║
║   Screen monitoring will be        ║
║   enabled during the exam.         ║
║                                    ║
║ Rules: Fullscreen required...      ║
║                                    ║
║              [Start Exam]          ║
╚════════════════════════════════════╝
```

### Exam 3: Full Proctoring (Most Restrictive)

```
╔════════════════════════════════════╗
║ Start Exam (Single Login)          ║
╠════════════════════════════════════╣
║                                    ║
║ ⓘ Proctoring Required:            ║
║   Your instructor requires         ║
║   proctoring for this exam.        ║
║   Webcam will be required.         ║
║   Screen sharing is also required. ║
║                                    ║
║ Rules: Fullscreen required...      ║
║                                    ║
║              [Start Exam]          ║
╚════════════════════════════════════╝
```

---

## Exam Creation Workflow

### Admin Creates Mixed-Type Exam with Full Proctoring

```
Step 1: Select Subject
┌──────────────────────────┐
│ Select Subject:          │
│ [Select - Calc I ▼]      │
└──────────────────────────┘

Step 2: Configure Exam Type
┌──────────────────────────┐
│ Exam Title: Calc Final   │
│ Duration:   120 min      │
│ Type:       [Mixed ▼]    │
└──────────────────────────┘

Step 3: Configure Question Types
┌──────────────────────────┐
│ MCQ:        [10]         │
│ Fill Blank: [5]          │
│ Free Text:  [3]          │
│ Total:      18 questions │
└──────────────────────────┘

Step 4: Add Questions (Mix of types)
┌──────────────────────────┐
│ Q1 (MCQ): What is...     │
│ Q2 (MCQ): Define...      │
│ ...                      │
│ Q11 (Fill): ___ = x+2    │
│ ...                      │
│ Q16 (Essay): Explain..   │
│ ...                      │
└──────────────────────────┘

Step 5: Configure Proctoring
┌──────────────────────────┐
│ ☑ Proctoring Required    │
│ Mode: [Webcam ▼]         │
│ ☑ Screen Sharing         │
└──────────────────────────┘

Step 6: Save
         [Create Exam] ← Saves everything!
```

---

## Question Type Distribution (Mixed Exam Example)

### Visual Breakdown

```
Total Questions: 18

MCQ                    50% (10 questions)
████████████░░░░░░░░░

Fill in the Blanks    28% (5 questions)
█████░░░░░░░░░░░░░░░

Free Text             17% (3 questions)
███░░░░░░░░░░░░░░░░░

Student sees:
"This exam has 10 multiple choice, 5 fill-in-the-blank,
 and 3 free text questions"
```

---

## Data Flow Diagram

### Old Way (Student-Controlled Proctoring)

```
┌──────────────┐
│   Student    │
└──────┬───────┘
       │ Chooses mode
       │ (Basic/Webcam)
       ▼
┌──────────────────────┐
│ Student Exam Attempt │
│ UI: Radio buttons    │
└──────┬───────────────┘
       │ Sends to server
       │ {mode: "WEBCAM",
       │  screenshareEnabled: true}
       ▼
┌──────────────────────┐
│   Backend API        │
│ Uses student choice  │
└──────────────────────┘
```

### New Way (Admin-Controlled Proctoring)

```
┌──────────────┐
│     Admin    │
└──────┬───────┘
       │ Configures
       │ exam settings
       ▼
┌──────────────────────┐
│    Database Exam     │
│ proctor_mode:        │
│   "WEBCAM"           │
│ proctor_screenshare: │
│   1 (required)       │
└──────┬───────────────┘
       │
       │ Student clicks "Start"
┌──────▼───────────────┐
│ Student Exam Attempt │
│ No choice - shows    │
│ admin requirements   │
└──────┬───────────────┘
       │ Requests proctor/start
       ▼
┌──────────────────────┐
│   Backend API        │
│ Reads exam config    │
│ Returns:             │
│   mode: "WEBCAM"     │
│   screenshare: true  │
└──────┬───────────────┘
       │
       ▼
   Server decides,
   student complies!
```

---

## Color Coding in UI

### Alert Box Color (Admin Requirements)

```
┌─────────────────────────────────────────┐
│ ℹ️  Proctoring Required (Blue Alert)    │
│                                         │
│ Your instructor requires proctoring...  │
└─────────────────────────────────────────┘
```

### Form Validation

```
✓ Proctoring Required (Green checkmark)
✗ Missing question count (Red error)
⚠ Screen sharing required (Yellow warning)
```

---

## Mobile/Responsive View

### Tablet/Mobile - Exam Type Selector

```
Exam Type:
┌─────────────────────┐
│ Mixed Types      ▼  │
└─────────────────────┘

(Single column layout for narrow screens)

Question Type Config:
┌─────────────────────┐
│ MCQ:  [5]          │
├─────────────────────┤
│ Fill: [3]          │
├─────────────────────┤
│ Free: [2]          │
└─────────────────────┘
```

### Tablet/Mobile - Proctoring Settings

```
Proctoring Settings:
┌─────────────────────┐
│ ☑ Required         │
├─────────────────────┤
│ Mode: Webcam   ▼   │
├─────────────────────┤
│ ☑ Screenshare      │
└─────────────────────┘
```

---

## Summary of Visual Changes

| Component       | Before           | After                 |
| --------------- | ---------------- | --------------------- |
| Exam Type       | Not configurable | Dropdown (4 options)  |
| Question Config | Not shown        | Conditional section   |
| Proctoring      | Student chooses  | Admin configured      |
| Mode Selection  | Radio buttons    | Alert (info only)     |
| Screenshare     | Checkbox         | Alert (info only)     |
| Student Control | High             | None (admin enforced) |

---

**All visual changes maintain consistent styling with existing LMS UI**
