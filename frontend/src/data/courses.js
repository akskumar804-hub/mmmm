export const baseCourses = [
  {
    id: 'c1',
    code: 'BSC-CS',
    title: 'B.Sc Computer Science',
    shortDescription: 'Foundational program in algorithms, programming, and modern software development.',
    description:
      'This three-year undergraduate program focuses on core computing concepts including data structures, algorithms, web technologies, and database systems. Students learn through a mix of lectures, labs, and project work.',
    admissionFee: 3000,
    tuitionFee: 15000,
    duration: '3 Years',
    level: 'Undergraduate',
    subjects: [
      {
        id: 'cs101',
        name: 'Data Structures',
        semester: 'Semester 1',
        chapters: [
          'Arrays & Linked Lists',
          'Stacks & Queues',
          'Trees & Graphs',
          'Hashing & Complexity'
        ]
      },
      {
        id: 'cs102',
        name: 'Database Systems',
        semester: 'Semester 2',
        chapters: [
          'Relational Model',
          'SQL Fundamentals',
          'Transactions',
          'Indexing & Optimization'
        ]
      }
    ]
  },
  {
    id: 'c2',
    code: 'BBA-GEN',
    title: 'Bachelor of Business Administration',
    shortDescription: 'Business fundamentals with a focus on marketing, finance, and operations.',
    description:
      'The BBA program introduces students to management, marketing, finance, and entrepreneurship. It is designed for future leaders of modern businesses.',
    admissionFee: 3000,
    tuitionFee: 14000,
    duration: '3 Years',
    level: 'Undergraduate',
    subjects: [
      {
        id: 'bba101',
        name: 'Principles of Management',
        semester: 'Semester 1',
        chapters: [
          'Planning & Organizing',
          'Staffing & Leading',
          'Controlling',
          'Decision Making'
        ]
      },
      {
        id: 'bba102',
        name: 'Marketing Basics',
        semester: 'Semester 2',
        chapters: [
          'Market Research',
          'Segmentation & Targeting',
          'Branding',
          'Digital Marketing Intro'
        ]
      }
    ]
  },
  {
    id: 'c3',
    code: 'MSC-DS',
    title: 'M.Sc Data Science',
    shortDescription: 'Postgraduate specialization in data analytics, machine learning, and big data.',
    description:
      'This program is tailored for graduates who want to specialize in data analytics and machine learning. It covers statistics, programming, and real-world analytic projects.',
    admissionFee: 3000,
    tuitionFee: 18000,
    duration: '2 Years',
    level: 'Postgraduate',
    subjects: [
      {
        id: 'ds201',
        name: 'Statistics for Data Science',
        semester: 'Semester 1',
        chapters: [
          'Probability Basics',
          'Distributions',
          'Hypothesis Testing',
          'Regression'
        ]
      },
      {
        id: 'ds202',
        name: 'Machine Learning Foundations',
        semester: 'Semester 2',
        chapters: [
          'Supervised Learning',
          'Unsupervised Learning',
          'Model Evaluation',
          'Model Deployment'
        ]
      }
    ]
  }
]

export function getCustomCourses() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('lms_demo_custom_courses')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomCourses(customCourses) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('lms_demo_custom_courses', JSON.stringify(customCourses))
}

export function getAllCourses() {
  return [...baseCourses, ...getCustomCourses()]
}
