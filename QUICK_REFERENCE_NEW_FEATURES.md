# Quick Reference: New Features

## Feature 1: Exam Type Selection

### What Changed?

Admins can now specify what types of questions will be in an exam:

- **Multiple Choice Only** - Only MCQ questions
- **Fill in the Blanks Only** - Only fill-in-the-blank questions
- **Free Text Only** - Only free response questions
- **Mixed Types** - Combination of all three

### How to Use (Admin)

1. Go to Exam Builder for your course
2. Select/create a subject
3. Find the **Exam Type** dropdown
4. Select the type you want:
   ```
   ┌─────────────────────────────────┐
   │ Exam Type                    ▼  │
   │ ✓ Multiple Choice Only           │
   │   Fill in the Blanks Only        │
   │   Free Text Only                 │
   │   Mixed Types                    │
   └─────────────────────────────────┘
   ```

### For Mixed Exams Only

If you select "Mixed Types", you'll see a new section:

```
Question Type Configuration
Specify how many questions of each type

Multiple Choice Questions: [ 5  ]
Fill in the Blanks:        [ 3  ]
Free Text Questions:       [ 2  ]
```

This tells students how many questions of each type to expect.

---

## Feature 2: Admin-Controlled Proctoring

### What Changed?

Previously: Students chose whether to use Basic or Webcam proctoring
**Now**: Admins decide what proctoring level is required for each exam

Students no longer see mode/screenshare options - the admin choice is enforced.

### How to Use (Admin)

1. Go to Exam Builder → Select Subject → Scroll to **Proctoring Settings**

2. Check "Proctoring Required" to enable:

   ```
   ☐ Proctoring Required
   ```

3. When enabled, you'll see:

   ```
   Proctoring Mode
   ┌─────────────────────────────────────────────┐
   │ ✓ Basic (Screen monitoring only)            │
   │   Webcam (Video required)                    │
   └─────────────────────────────────────────────┘

   ☐ Require Screen Sharing
   ```

### Proctoring Mode Options

| Mode       | What It Does                                                  | Students See                     |
| ---------- | ------------------------------------------------------------- | -------------------------------- |
| **Basic**  | Monitors screen activity, keyboard, mouse, browser violations | Tab monitoring, activity logging |
| **Webcam** | Records student via webcam during exam                        | Webcam feed needed               |

### Screen Sharing Options

- **Unchecked** (optional): Students can share screen but don't have to
- **Checked** (required): Students MUST share their screen to take the exam

### Example Configurations

**Configuration 1: No Proctoring**

```
☐ Proctoring Required
→ Students can take exam however they want
```

**Configuration 2: Basic Proctoring Only**

```
☑ Proctoring Required
  ✓ Basic (Screen monitoring only)
  ☐ Require Screen Sharing
→ Students monitored but no webcam/screenshare needed
```

**Configuration 3: Full Proctoring**

```
☑ Proctoring Required
  ✓ Webcam (Video required)
  ☑ Require Screen Sharing
→ Students must show face AND screen
```

---

## What Students See

### Before (Old Way)

Students would see checkboxes:

```
☑ Basic
☐ Webcam
☐ Screen share (optional)
```

Students could choose their own level.

### After (New Way)

Students see requirements:

```
Proctoring Required: Your instructor requires proctoring for this exam.
Webcam will be required. Screen sharing is also required.

[Start Exam] button
```

Students cannot change these settings - they're enforced by the admin config.

---

## Configuration Examples

### High Security Exam

```
Exam Type: MIXED
- 20 MCQ questions
- 5 Fill in blanks
- 3 Free text

Proctoring: YES
- Mode: Webcam
- Screenshare: Required
```

### Quick Quiz

```
Exam Type: MCQ Only
- 10 multiple choice questions

Proctoring: NO
```

### Essay Exam

```
Exam Type: FREE_TEXT Only
- 3 essay questions

Proctoring: YES
- Mode: Webcam (to verify identity)
- Screenshare: No (can use notes/references)
```

---

## FAQ

**Q: Can students still see what type of exam it is?**
A: Not yet - this is for admin planning. In future updates, students could see this info.

**Q: What if I set question counts that don't match my actual questions?**
A: The system displays them as info for students, but doesn't enforce strict matching. Add questions matching your configured counts.

**Q: Can I change proctoring settings after students start an exam?**
A: The settings applied are from when they started. Changing them afterward only affects future attempts.

**Q: What happens to old exams without these settings?**
A: They default to:

- Exam Type: Mixed
- Proctoring: Not required
- Mode: Basic (if proctoring is manually enabled)

**Q: Can I have different proctoring for different students?**
A: Not yet - it's one setting per exam. Could be added in future.

**Q: Will this affect exam results or grading?**
A: No - it only controls how exams are taken, not how they're scored.

---

## Keyboard Shortcuts / Tips

- **Save frequently**: Always click "Update Exam" after making changes
- **Toggle proctoring**: Uncheck "Proctoring Required" to disable all proctor options
- **Test before deploying**: Create a test exam with mixed settings before rollout

---

## Troubleshooting

| Issue                                | Solution                                         |
| ------------------------------------ | ------------------------------------------------ |
| Question type config not saving      | Make sure you selected "Mixed Types" first       |
| Students see old proctoring settings | Clear browser cache, ensure backend deployed     |
| Can't enable screenshare requirement | First enable Webcam mode, then check screenshare |
| Proctoring settings disappear        | Save exam again - they may not have persisted    |

---

## API Details (For Developers)

### New Fields in Exam Object

```javascript
exam = {
  id,
  title,
  durationMinutes,
  questions,

  // NEW FIELDS:
  examType, // "MCQ" | "FILL_BLANKS" | "FREE_TEXT" | "MIXED"
  questionTypeConfig, // {MCQ: 5, FILL_BLANKS: 3, FREE_TEXT: 2}
  proctorRequired, // boolean
  proctorMode, // "BASIC" | "WEBCAM"
  proctorScreenshareRequired, // boolean
};
```

### Updated Endpoints

- `POST /admin/subjects/:id/exam` - Now accepts new fields
- `GET /admin/subjects/:id/exam` - Now returns new fields
- `POST /student/exams/:id/proctor/start` - Now returns server-determined mode

---

**Last Updated**: December 31, 2025
**Version**: 1.0
