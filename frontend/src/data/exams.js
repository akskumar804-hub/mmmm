export const examSubjects = [
  {
    id: 'cs101',
    subjectName: 'Data Structures',
    courseId: 'c1',
    courseTitle: 'B.Sc Computer Science',
    durationMinutes: 45,
    questions: [
      {
        id: 'cs101-q1',
        text: 'Which data structure follows the First In, First Out (FIFO) principle?',
        options: ['Stack', 'Queue', 'Tree', 'Graph'],
        correctIndex: 1
      },
      {
        id: 'cs101-q2',
        text: 'Which of the following is the best data structure for implementing recursion?',
        options: ['Queue', 'Array', 'Stack', 'Graph'],
        correctIndex: 2
      },
      {
        id: 'cs101-q3',
        text: 'Which operation is generally fastest on a hash table with a good hash function?',
        options: ['Search', 'Insertion', 'Deletion', 'All of the above'],
        correctIndex: 3
      }
    ]
  },
  {
    id: 'bba101',
    subjectName: 'Principles of Management',
    courseId: 'c2',
    courseTitle: 'Bachelor of Business Administration',
    durationMinutes: 30,
    questions: [
      {
        id: 'bba101-q1',
        text: 'Which management function involves setting objectives and deciding in advance how to achieve them?',
        options: ['Planning', 'Organizing', 'Directing', 'Controlling'],
        correctIndex: 0
      },
      {
        id: 'bba101-q2',
        text: 'Which of the following is NOT a level of management?',
        options: ['Top-level', 'Middle-level', 'First-line', 'External-level'],
        correctIndex: 3
      },
      {
        id: 'bba101-q3',
        text: 'Which principle emphasizes that an employee should receive orders from only one superior?',
        options: ['Unity of command', 'Scalar chain', 'Discipline', 'Order'],
        correctIndex: 0
      }
    ]
  },
  {
    id: 'ds201',
    subjectName: 'Statistics for Data Science',
    courseId: 'c3',
    courseTitle: 'M.Sc Data Science',
    durationMinutes: 45,
    questions: [
      {
        id: 'ds201-q1',
        text: 'Which measure of central tendency is most affected by extreme values?',
        options: ['Mean', 'Median', 'Mode', 'All are equally affected'],
        correctIndex: 0
      },
      {
        id: 'ds201-q2',
        text: 'The probability of all mutually exclusive events in a sample space sums to:',
        options: ['0', '1', 'Between 0 and 1', 'Depends on the experiment'],
        correctIndex: 1
      },
      {
        id: 'ds201-q3',
        text: 'Which of the following is commonly used as a loss function in linear regression?',
        options: ['Cross-entropy', 'Mean squared error', 'Hinge loss', 'Log loss'],
        correctIndex: 1
      }
    ]
  }
]
