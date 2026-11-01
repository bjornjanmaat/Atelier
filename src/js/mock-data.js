/**
 * Mock Account & Demo Data Engine for Atelier
 * Fully offline, zero personal data, perfectly suited for testing and mockups.
 */

function isDemoCredentials(domain, token) {
  if (!domain || !token) return false;
  const cleanDomain = String(domain).trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const cleanToken = String(token).trim().toLowerCase();
  return (cleanDomain === 'demo' || cleanDomain === 'demo.instructure.com') && cleanToken === 'demo';
}

window.isDemoCredentials = isDemoCredentials;

/**
 * Generate a dynamic, rich Mock Account dataset
 */
function getMockAccountData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Helper for dynamic ISO strings
  const offsetDate = (daysOffset, hour = 23, minute = 59) => {
    const d = new Date(year, month, day + daysOffset, hour, minute, 0);
    return d.toISOString();
  };

  const offsetDateTimeObj = (daysOffset, hour = 10, minute = 0, durationHours = 1.5) => {
    const start = new Date(year, month, day + daysOffset, hour, minute, 0);
    const end = new Date(start.getTime() + durationHours * 3600 * 1000);
    return { start, end };
  };

  const mockProfile = {
    id: 91000,
    name: "Alex Rivera",
    short_name: "Alex",
    sortable_name: "Rivera, Alex",
    title: "Design & Computer Science Scholar",
    bio: "Senior student exploring Swiss editorial typography, distributed routing algorithms, and sustainable environmental architecture.",
    primary_email: "alex.rivera@atelier.mock",
    login_id: "arivera_demo",
    avatar_url: "",
    time_zone: "Europe/Amsterdam",
    locale: "en",
    effective_locale: "en-US",
    calendar: {
      ics: "https://canvas.instructure.com/feeds/calendars/user_mock_schedule.ics"
    },
    lti_user_id: "mock-student-91000",
    integration_id: "SIS-MOCK-91000"
  };

  const mockCourses = [
    {
      id: 91001,
      name: "Swiss Editorial Grids & Baseline Ratios",
      course_code: "DSGN 301",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80",
      teachers: [
        {
          id: 801,
          display_name: "Prof. Sarah Lindqvist",
          avatar_image_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80"
        }
      ],
      enrollments: [
        { type: "student", computed_current_score: 97.4, computed_current_grade: "A+" }
      ]
    },
    {
      id: 91002,
      name: "Algorithmic Routing & Network Graphs",
      course_code: "CS 310",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80",
      teachers: [
        {
          id: 802,
          display_name: "Dr. Marcus Vance",
          avatar_image_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80"
        }
      ],
      enrollments: [
        { type: "student", computed_current_score: 94.8, computed_current_grade: "A" }
      ]
    },
    {
      id: 91003,
      name: "Interactive Systems & Spatial Interfaces",
      course_code: "HCI 240",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=600&q=80",
      teachers: [
        {
          id: 803,
          display_name: "Dr. Elena Rostova",
          avatar_image_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80"
        }
      ],
      enrollments: [
        { type: "student", computed_current_score: 91.5, computed_current_grade: "A-" }
      ]
    },
    {
      id: 91004,
      name: "Sustainable Architecture & Daylight Engineering",
      course_code: "ARCH 420",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
      teachers: [
        {
          id: 804,
          display_name: "Prof. Julian Thorne",
          avatar_image_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80"
        }
      ],
      enrollments: [
        { "type": "student", computed_current_score: 96.0, computed_current_grade: "A" }
      ]
    }
  ];

  // Course Details per course
  const mockCourseDetails = {
    91001: {
      courseId: 91001,
      announcements: [
        {
          id: 910011,
          title: "Studio Critique: 12-Column Compound Grids & Baseline Alignment",
          posted_at: offsetDate(-1, 14, 30),
          user_name: "Prof. Sarah Lindqvist",
          read_state: "unread",
          message: "<p>Hello studio! Please bring full-scale trimmed proofs of your 12-column editorial spread to Thursday's pin-up session. Focus on the baseline grid lock between primary body copy (13.5 pt leading) and secondary caption marginalia.</p>"
        },
        {
          id: 910012,
          title: "Reading: Josef Müller-Brockmann — Grid Systems in Graphic Design",
          posted_at: offsetDate(-6, 9, 0),
          user_name: "Prof. Sarah Lindqvist",
          read_state: "read",
          message: "<p>Chapter 3 & 4 on modular proportions are now available as digital scans in Module 2. Pay close attention to how vertical division informs column rhythm.</p>"
        }
      ],
      modules: [
        {
          id: 91011,
          name: "Module 1: Mathematical Foundations of Swiss Typography",
          state: "completed",
          items: [
            { id: 91101, title: "Course Introduction & Studio Principles", type: "SubHeader" },
            {
              id: 91107,
              title: "DSGN301_Syllabus_Swiss_Typography.pdf",
              type: "File",
              content_id: 91401,
              url: "https://demo.instructure.com/files/91401/download",
              requirement: { completed: true }
            },
            {
              id: 91102,
              title: "Lecture 1: The Golden Ratio & Tschichold Canon",
              type: "Page",
              body: "<h3>Harmonic Page Divisions</h3><p>Jan Tschichold's golden canon of page division structures text blocks and margins in 2:3:4:6 proportions, maximizing white space readability.</p>",
              requirement: { completed: true }
            },
            { id: 91103, title: "Lab: Single-Column Monograph Layout", type: "Assignment", points: 50, requirement: { completed: true } }
          ]
        },
        {
          id: 91012,
          name: "Module 2: Multicolumn Grid Systems & Hierarchy",
          state: "in-progress",
          items: [
            { id: 91104, title: "Complex Publication Architecture", type: "SubHeader" },
            {
              id: 91108,
              title: "Josef_Muller_Brockmann_Grid_Systems.pdf",
              type: "File",
              content_id: 91402,
              url: "https://demo.instructure.com/files/91402/download",
              requirement: { completed: true }
            },
            {
              id: 91105,
              title: "Lecture 2: Compound 12-Column Editorial Systems",
              type: "Page",
              body: "<h3>Compound Grids</h3><p>A 12-column system cleanly accommodates 2, 3, 4, and 6 column layouts simultaneously on the same master grid without visual dissonance.</p>",
              requirement: { completed: true }
            },
            { id: 91106, title: "Deliverable 1: Magazine Master Spread System", type: "Assignment", points: 100, requirement: { completed: false } }
          ]
        }
      ],
      assignments: [
        {
          id: 91301,
          name: "Deliverable 1: Magazine Master Spread System",
          due_at: offsetDate(2, 23, 59),
          points_possible: 100,
          submission_types: ["online_upload"],
          description: "<h3>Deliverable 1: Master Editorial Spread</h3><p>Construct a multi-page publication spread employing a strict 12-column compound grid with locked baseline alignment.</p><ul><li>InDesign or Illustrator source export packaged with assets</li><li>High-resolution 300 DPI PDF preview</li><li>Annotated grid construction diagram overlay</li></ul>",
          submission: { workflow_state: "unsubmitted", score: null, grade: null }
        },
        {
          id: 91302,
          name: "Lab 1: Single-Column Monograph Layout",
          due_at: offsetDate(-14, 23, 59),
          points_possible: 50,
          submission_types: ["online_upload"],
          description: "<h3>Lab 1: Monograph Layout</h3><p>Typeset an essay using classical margin canons and optimal 65-character line length.</p>",
          submission: { workflow_state: "graded", score: 50, grade: "100%", submitted_at: offsetDate(-15, 18, 0) }
        }
      ],
      files: [
        {
          id: 91401,
          display_name: "DSGN301_Syllabus_Swiss_Typography.pdf",
          filename: "DSGN301_Syllabus_Swiss_Typography.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2514,
          url: "https://demo.instructure.com/files/91401/download",
          created_at: offsetDate(-30),
          updated_at: offsetDate(-30)
        },
        {
          id: 91402,
          display_name: "Josef_Muller_Brockmann_Grid_Systems.pdf",
          filename: "Josef_Muller_Brockmann_Grid_Systems.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2508,
          url: "https://demo.instructure.com/files/91402/download",
          created_at: offsetDate(-20),
          updated_at: offsetDate(-20)
        }
      ]
    },
    91002: {
      courseId: 91002,
      announcements: [
        {
          id: 910021,
          title: "Midterm Routing Benchmark Harness & Heuristics Released",
          posted_at: offsetDate(-2, 11, 15),
          user_name: "Dr. Marcus Vance",
          read_state: "unread",
          message: "<p>The automated test suite for Project 2 (A* shortest-path routing across continental road networks) is now accessible via the git mirror. Verify both admissibility and consistency invariants.</p>"
        }
      ],
      modules: [
        {
          id: 91021,
          name: "Module 1: Shortest Paths & Priority Queues",
          state: "completed",
          items: [
            { id: 91201, title: "Foundations of Graph Algorithms", type: "SubHeader" },
            {
              id: 91206,
              title: "CS310_Syllabus_Routing_Algorithms.pdf",
              type: "File",
              content_id: 91403,
              url: "https://demo.instructure.com/files/91403/download",
              requirement: { completed: true }
            },
            {
              id: 91202,
              title: "Lecture 1: Dijkstra's Algorithm & Fibonacci Heaps",
              type: "Page",
              body: "<h3>Dijkstra Invariants</h3><p>Dijkstra's greedy expansion maintains non-decreasing distance estimates from the source node using a min-priority queue.</p>",
              requirement: { completed: true }
            },
            { id: 91203, title: "Lab 1: Sparse Graph Representations in C++", type: "Assignment", points: 50, requirement: { completed: true } }
          ]
        },
        {
          id: 91022,
          name: "Module 2: A* Search & Admissible Heuristics",
          state: "in-progress",
          items: [
            { id: 91204, title: "Heuristic Search Optimality", type: "SubHeader" },
            {
              id: 91207,
              title: "Dijkstra_and_AStar_Optimality_Proof.pdf",
              type: "File",
              content_id: 91404,
              url: "https://demo.instructure.com/files/91404/download",
              requirement: { completed: false }
            },
            { id: 91205, title: "Project 2: Continental Road Network A* Router", type: "Assignment", points: 150, requirement: { completed: false } }
          ]
        }
      ],
      assignments: [
        {
          id: 91303,
          name: "Project 2: Continental Road Network A* Router",
          due_at: offsetDate(4, 23, 59),
          points_possible: 150,
          submission_types: ["online_upload"],
          description: "<h3>Project 2: A* Road Network Routing Engine</h3><p>Implement an optimized A* search algorithm using great-circle Euclidean distance heuristics. Benchmark against Dijkstra on graphs exceeding 10M vertices.</p>",
          submission: { workflow_state: "unsubmitted", score: null, grade: null }
        },
        {
          id: 91304,
          name: "Problem Set 1: Heuristic Consistency Proofs",
          due_at: offsetDate(-7, 23, 59),
          points_possible: 80,
          submission_types: ["online_upload"],
          description: "<h3>Problem Set 1</h3><p>Mathematical proofs regarding monotonicity, admissibility, and triangle inequality bounds in directed graphs.</p>",
          submission: { workflow_state: "graded", score: 76, grade: "95%", submitted_at: offsetDate(-8, 20, 0) }
        }
      ],
      files: [
        {
          id: 91403,
          display_name: "CS310_Syllabus_Routing_Algorithms.pdf",
          filename: "CS310_Syllabus_Routing_Algorithms.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2414,
          url: "https://demo.instructure.com/files/91403/download",
          created_at: offsetDate(-30),
          updated_at: offsetDate(-30)
        },
        {
          id: 91404,
          display_name: "Dijkstra_and_AStar_Optimality_Proof.pdf",
          filename: "Dijkstra_and_AStar_Optimality_Proof.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2448,
          url: "https://demo.instructure.com/files/91404/download",
          created_at: offsetDate(-10),
          updated_at: offsetDate(-10)
        }
      ]
    },
    91003: {
      courseId: 91003,
      announcements: [
        {
          id: 910031,
          title: "Spatial Prototyping Hardware Kits in Lab 3",
          posted_at: offsetDate(-3, 16, 0),
          user_name: "Dr. Elena Rostova",
          read_state: "read",
          message: "<p>Spatial tracking sensor rigs and eye-gaze peripherals are ready for checkout during lab hours. Please reserve time slots via the course portal.</p>"
        }
      ],
      modules: [
        {
          id: 91031,
          name: "Module 1: Spatial Mental Models & Ergonomics",
          state: "in-progress",
          items: [
            { id: 91311, title: "Spatial Interaction Fundamentals", type: "SubHeader" },
            {
              id: 91313,
              title: "HCI240_Spatial_Interaction_Syllabus.pdf",
              type: "File",
              content_id: 91405,
              url: "https://demo.instructure.com/files/91405/download",
              requirement: { completed: true }
            },
            { id: 91312, title: "Milestone 1: Spatial Window Management Prototype", type: "Assignment", points: 100, requirement: { completed: false } }
          ]
        }
      ],
      assignments: [
        {
          id: 91305,
          name: "Milestone 1: Spatial Window Management Prototype",
          due_at: offsetDate(6, 23, 59),
          points_possible: 100,
          submission_types: ["online_upload"],
          description: "<h3>Milestone 1: Spatial Windowing</h3><p>Design a gesture-driven canvas interface for managing floating educational study cards with depth layering and physics-based inertia.</p>",
          submission: { workflow_state: "unsubmitted", score: null, grade: null }
        }
      ],
      files: [
        {
          id: 91405,
          display_name: "HCI240_Spatial_Interaction_Syllabus.pdf",
          filename: "HCI240_Spatial_Interaction_Syllabus.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2204,
          url: "https://demo.instructure.com/files/91405/download",
          created_at: offsetDate(-30),
          updated_at: offsetDate(-30)
        }
      ]
    },
    91004: {
      courseId: 91004,
      announcements: [
        {
          id: 910041,
          title: "Overcast Sky Daylight Simulator Testing Slots Open",
          posted_at: offsetDate(0, 8, 30),
          user_name: "Prof. Julian Thorne",
          read_state: "unread",
          message: "<p>Our artificial sky simulator is calibrated for the 1:20 physical scale models. Verify your south-facing brise-soleil angles before your testing appointment.</p>"
        }
      ],
      modules: [
        {
          id: 91041,
          name: "Module 1: Solar Geometry & Daylight Factors",
          state: "in-progress",
          items: [
            { id: 91411, title: "Passive Environmental Systems", type: "SubHeader" },
            {
              id: 91413,
              title: "ARCH420_Daylight_Factors_and_Solar_Geometry.pdf",
              type: "File",
              content_id: 91406,
              url: "https://demo.instructure.com/files/91406/download",
              requirement: { completed: true }
            },
            { id: 91412, title: "Studio Project: Reading Gallery Daylight & Thermal Section", type: "Assignment", points: 120, requirement: { completed: false } }
          ]
        }
      ],
      assignments: [
        {
          id: 91306,
          name: "Studio Project: Reading Gallery Daylight & Thermal Section",
          due_at: offsetDate(11, 23, 59),
          points_possible: 120,
          submission_types: ["online_upload"],
          description: "<h3>Studio Section Project</h3><p>Deliver an analytical 1:50 transverse section model demonstrating passive stack ventilation and an average Daylight Factor of 4.5% across reading stations.</p>",
          submission: { workflow_state: "unsubmitted", score: null, grade: null }
        }
      ],
      files: [
        {
          id: 91406,
          display_name: "ARCH420_Daylight_Factors_and_Solar_Geometry.pdf",
          filename: "ARCH420_Daylight_Factors_and_Solar_Geometry.pdf",
          content_type: "application/pdf",
          mime_class: "pdf",
          size: 2452,
          url: "https://demo.instructure.com/files/91406/download",
          created_at: offsetDate(-30),
          updated_at: offsetDate(-30)
        }
      ]
    }
  };

  // Schedule Events dynamically mapped to today and the current week
  const scheduleEvents = [
    {
      id: "mock-ev-today-1",
      summary: "DSGN 301 Studio: Swiss Typography & Grid Proportions",
      start: offsetDateTimeObj(0, 10, 0, 1.5).start,
      end: offsetDateTimeObj(0, 10, 0, 1.5).end,
      location: "Design Studio 204",
      description: "Physical pin-up of compound grid spreads and baseline alignment review.\nTeacher: Prof. Sarah Lindqvist\nType: Studio",
      categories: "Studio",
      isScheduleEvent: true
    },
    {
      id: "mock-ev-today-2",
      summary: "CS 310 Lecture: A* Graph Routing & Admissibility Invariants",
      start: offsetDateTimeObj(0, 14, 0, 1.5).start,
      end: offsetDateTimeObj(0, 14, 0, 1.5).end,
      location: "Turing Hall 102",
      description: "Monotonicity condition proofs, priority queue implementations, and continental road benchmarks.\nTeacher: Dr. Marcus Vance\nType: Lecture",
      categories: "Lecture",
      isScheduleEvent: true
    },
    {
      id: "mock-ev-tomorrow-1",
      summary: "ARCH 420 Seminar: Daylight Factor & Cross-Ventilation",
      start: offsetDateTimeObj(1, 9, 30, 2.0).start,
      end: offsetDateTimeObj(1, 9, 30, 2.0).end,
      location: "Architecture Pavilion B",
      description: "Solar geometry calculations and timber louvers.\nTeacher: Prof. Julian Thorne\nType: Seminar",
      categories: "Seminar",
      isScheduleEvent: true
    },
    {
      id: "mock-ev-tomorrow-2",
      summary: "HCI 240 Lab: Spatial Interface Prototyping Clinic",
      start: offsetDateTimeObj(1, 14, 0, 1.5).start,
      end: offsetDateTimeObj(1, 14, 0, 1.5).end,
      location: "Media Lab 3",
      description: "Sensor rig calibration and gaze-tracking gesture tests.\nTeacher: Dr. Elena Rostova\nType: Lab",
      categories: "Lab",
      isScheduleEvent: true
    },
    {
      id: "mock-ev-day3-1",
      summary: "CS 310 Recitation: Network Partitions & Dijkstra Comparisons",
      start: offsetDateTimeObj(2, 11, 0, 1.0).start,
      end: offsetDateTimeObj(2, 11, 0, 1.0).end,
      location: "Gates Building 312",
      description: "TA code review session for Project 2 test suites.\nTeacher: TA Alex Chen\nType: Tutorial",
      categories: "Tutorial",
      isScheduleEvent: true
    }
  ];

  // Mock Inbox Conversations
  const mockConversations = [
    {
      id: 7101,
      subject: "Studio Review & Compound 12-Column Grid",
      workflow_state: "read",
      last_message: "Your baseline rhythm calculation works beautifully across the spread. Let's discuss the folios tomorrow.",
      last_message_at: offsetDate(-1, 16, 20),
      message_count: 3,
      context_name: "DSGN 301",
      participants: [
        { id: 801, name: "Prof. Sarah Lindqvist", avatar_url: "" },
        { id: 91000, name: "Alex Rivera", avatar_url: "" }
      ],
      messages: [
        {
          id: 71011,
          author_id: 801,
          created_at: offsetDate(-2, 10, 0),
          body: "Hi Alex, please bring your proof prints of the 12-column grid system to studio tomorrow for peer feedback."
        },
        {
          id: 71012,
          author_id: 91000,
          created_at: offsetDate(-2, 14, 30),
          body: "Will do! I have calibrated the baseline grid at 13.5 pt leading with 16 mm gutters on coated stock."
        },
        {
          id: 71013,
          author_id: 801,
          created_at: offsetDate(-1, 16, 20),
          body: "Your baseline rhythm calculation works beautifully across the spread. Let's discuss the folios tomorrow."
        }
      ]
    },
    {
      id: 7102,
      subject: "A* Heuristic Optimality & Triangle Inequality",
      workflow_state: "unread",
      last_message: "Remember to verify the consistency condition on the directed graph before running the benchmark.",
      last_message_at: offsetDate(0, 9, 45),
      message_count: 2,
      context_name: "CS 310",
      participants: [
        { id: 802, name: "Dr. Marcus Vance", avatar_url: "" },
        { id: 91000, name: "Alex Rivera", avatar_url: "" }
      ],
      messages: [
        {
          id: 71021,
          author_id: 91000,
          created_at: offsetDate(-1, 18, 15),
          body: "Dr. Vance, does our binary heap priority queue need decrease-key optimization or is duplicate node insertion acceptable for Lab 2?"
        },
        {
          id: 71022,
          author_id: 802,
          created_at: offsetDate(0, 9, 45),
          body: "Remember to verify the consistency condition on the directed graph before running the benchmark. Lazy deletion via duplicate insertion with a visited set is completely fine!"
        }
      ]
    },
    {
      id: 7103,
      subject: "Daylight Simulation Model & Clerestory Angle",
      workflow_state: "read",
      last_message: "Approved for the physical overcast sky simulator test.",
      last_message_at: offsetDate(-3, 11, 0),
      message_count: 2,
      context_name: "ARCH 420",
      participants: [
        { id: 804, name: "Prof. Julian Thorne", avatar_url: "" },
        { id: 91000, name: "Alex Rivera", avatar_url: "" }
      ],
      messages: [
        {
          id: 71031,
          author_id: 91000,
          created_at: offsetDate(-4, 15, 20),
          body: "Uploaded the revised section model with 45-degree louvers and clerestory vents."
        },
        {
          id: 71032,
          author_id: 804,
          created_at: offsetDate(-3, 11, 0),
          body: "Approved for the physical overcast sky simulator test."
        }
      ]
    }
  ];

  // Mock Notes matching mock-account/notes
  const mockNotes = [
    {
      id: "mock-note-passive-daylight",
      title: "Passive Stack Ventilation & Daylight Factor",
      courseId: "91004",
      contentHtml: "<h2>Section Design Takeaways</h2><p>Combining south-facing horizontal timber brise-soleil louvers with high clerestory operable vents balances winter solar heat gain with summer stack-effect cooling.</p><ul><li>Target average <strong>Daylight Factor</strong> of <code>3.5%–5.0%</code> across the reading gallery.</li><li>Cross-laminated timber (CLT) 5-ply floor slabs span 6.4 m cleanly without drop beams.</li></ul>",
      createdAt: offsetDate(-1, 17, 7),
      updatedAt: offsetDate(-1, 17, 7)
    },
    {
      id: "mock-note-astar-routing",
      title: "Dijkstra vs. A* Search — Admissibility & Consistency",
      courseId: "91002",
      contentHtml: "<h2>Shortest-Path Optimality Conditions</h2><p>An A* heuristic <code>h(u)</code> guarantees optimal shortest paths with tree search when admissible (<code>h(u) &lt;= d*(u, t)</code>), and with graph search (closed set) when <strong>consistent</strong>:</p><ul><li>Triangle inequality: <code>h(u) &lt;= w(u, v) + h(v)</code> for every directed edge <code>(u, v)</code>.</li><li>With binary heap priority queues, time complexity is <code>O((V + E) log V)</code>.</li></ul>",
      createdAt: offsetDate(-1, 19, 7),
      updatedAt: offsetDate(-1, 19, 7)
    },
    {
      id: "mock-note-editorial-grids",
      title: "Swiss Editorial Grids & Baseline Ratios",
      courseId: "91001",
      contentHtml: "<h2>Compound 12-Column Grid Notes</h2><p>Dividing the page into <strong>12 columns</strong> allows seamless switching between 2-column essays, 3-column caption rails, and 4-column index tables on the same master spread.</p><ul><li><strong>Body copy:</strong> 9.5 pt / 13.5 pt leading</li><li><strong>Running marginalia:</strong> 7.5 pt / 10.5 pt aligned every third baseline</li><li><strong>Inner/outer margins:</strong> 16 mm gutter, 22 mm fore-edge</li></ul>",
      createdAt: offsetDate(-1, 21, 7),
      updatedAt: offsetDate(-1, 21, 7)
    }
  ];

  return {
    profile: mockProfile,
    self: mockProfile,
    profileResult: {
      profile: mockProfile,
      self: mockProfile,
      meta: {
        instanceUrl: "https://demo.instructure.com",
        fetchedAt: new Date().toISOString(),
        isDemo: true
      }
    },
    courses: mockCourses,
    courseDetails: mockCourseDetails,
    scheduleEvents: scheduleEvents,
    conversations: mockConversations,
    notes: mockNotes
  };
}

window.getMockAccountData = getMockAccountData;

