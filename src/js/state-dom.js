/**
 * Canvas Next - Desktop Application Controller
 * Handles Navigation, Courses Dashboard, Dedicated Course Page (Announcements, Modules, Assignments, Grades),
 * and Settings/Profile Management.
 */

// Storage keys
const STORAGE_KEYS = {
  DOMAIN: 'canvas_domain',
  TOKEN: 'canvas_token',
  REMEMBER: 'canvas_remember',
  THEME: 'canvas_theme',
  COURSE_CUSTOMIZATIONS: 'canvas_course_customizations',
  SCHEDULE_ICAL: 'canvas_schedule_ical_url',
  SCHEDULE_CACHE: 'canvas_schedule_cache',
  NOTES_STORAGE_PATH: 'canvas_notes_storage_path',
  NOTES_CACHE: 'canvas_notes_cache',
  READ_ANNOUNCEMENTS: 'canvas_read_announcements',
  ARCHIVED_COURSES: 'canvas_archived_courses',
  CALENDAR_ONBOARDING_SEEN: 'canvas_calendar_onboarding_seen'
};

// Rich Demo Dataset
const DEMO_DATA = {
  profile: {
    id: 1029481,
    name: "Alex Rivera",
    short_name: "Alex",
    sortable_name: "Rivera, Alex",
    title: "Computer Science & Design Scholar",
    bio: "Passionate about AI, distributed computing, and human-computer interaction. Building next-generation educational interfaces.",
    primary_email: "alex.rivera@university.edu",
    login_id: "arivera_2026",
    avatar_url: "",
    time_zone: "America/New_York",
    locale: "en",
    effective_locale: "en-US",
    calendar: {
      ics: "https://canvas.instructure.com/feeds/calendars/user_arivera_demo_feed.ics"
    },
    lti_user_id: "c3b9b462-817c-482a-bc91-38fce5bb1822",
    integration_id: "SIS-STU-884102"
  },
  self: {
    id: 1029481,
    name: "Alex Rivera",
    sortable_name: "Rivera, Alex",
    short_name: "Alex",
    sis_user_id: "SIS-STU-884102",
    login_id: "arivera_2026",
    email: "alex.rivera@university.edu"
  },
  courses: [
    {
      id: 48201,
      name: "CS 301: Distributed Systems & Cloud Infrastructure",
      course_code: "CS 301",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80",
      teachers: [
        { id: 891, display_name: "Dr. Marcus Vance", avatar_image_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" }
      ],
      enrollments: [
        { type: "student", computed_current_score: 96.4, computed_current_grade: "A" }
      ]
    },
    {
      id: 48202,
      name: "DS 420: Applied Machine Learning & Neural Networks",
      course_code: "DS 420",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=600&q=80",
      teachers: [
        { id: 892, display_name: "Prof. Elena Rostova", avatar_image_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80" }
      ],
      enrollments: [
        { type: "student", computed_current_score: 92.8, computed_current_grade: "A-" }
      ]
    },
    {
      id: 48203,
      name: "UX 250: Human-Computer Interaction & Systems",
      course_code: "UX 250",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=600&q=80",
      teachers: [
        { id: 893, display_name: "Sarah Lindqvist", avatar_image_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80" }
      ],
      enrollments: [
        { type: "student", computed_current_score: 98.1, computed_current_grade: "A+" }
      ]
    },
    {
      id: 48204,
      name: "MATH 310: Advanced Linear Algebra & Vectors",
      course_code: "MATH 310",
      term: { id: 101, name: "Fall 2026" },
      workflow_state: "available",
      image_download_url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=600&q=80",
      teachers: [
        { id: 894, display_name: "Dr. David Kim", avatar_image_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80" }
      ],
      enrollments: [
        { type: "student", computed_current_score: 89.5, computed_current_grade: "B+" }
      ]
    }
  ],
  meta: {
    instanceUrl: "https://canvas.instructure.com",
    fetchedAt: new Date().toISOString(),
    isDemo: true
  }
};

// Demo Detailed Course Content (Announcements, Modules, Assignments)
const DEMO_COURSE_DETAILS = {
  announcements: [
    {
      id: 901,
      title: "Midterm Exam Logistics & Practice Problems Released",
      posted_at: "2026-10-10T14:30:00Z",
      user_name: "Dr. Marcus Vance",
      read_state: "unread",
      message: "<p>Hello class, the midterm exam will take place next Wednesday. Please review the practice problem sets in Module 4. We will hold an optional review session Monday evening at 6:00 PM in Room 302 and over Zoom.</p>"
    },
    {
      id: 902,
      title: "Project 2: Raft Leader Election Test Suites Available",
      posted_at: "2026-10-06T09:15:00Z",
      user_name: "Dr. Marcus Vance",
      read_state: "read",
      message: "<p>We have published automated verification harnesses for test case 2A and 2B. Please clone the updated git repo from Module 3 and verify your RPC network partition handling before submission.</p>"
    },
    {
      id: 903,
      title: "Guest Lecture: Distributed Systems at Scale (Meta / Google)",
      posted_at: "2026-09-24T16:00:00Z",
      user_name: "Teaching Team",
      read_state: "read",
      message: "<p>We are delighted to host Dr. Priya Sharma from Google Infrastructure next Tuesday to discuss practical challenges of global database replication and Spanner.</p>"
    },
    {
      id: 904,
      title: "Problem Set 1 Solutions & Grading Rubric Published",
      posted_at: "2026-09-20T11:20:00Z",
      user_name: "TA Alex Chen",
      read_state: "read",
      message: "<p>Problem Set 1 has been graded. Please check your score and feedback in the Grades tab. If you have any regrade requests, please submit them via office hours within one week.</p>"
    },
    {
      id: 905,
      title: "Office Hours Schedule Updates for Week 3",
      posted_at: "2026-09-12T13:45:00Z",
      user_name: "Dr. Marcus Vance",
      read_state: "read",
      message: "<p>Please note that Thursday office hours will move to 3:30 PM - 5:00 PM this week due to a faculty meeting. As always, feel free to post asynchronous questions anytime.</p>"
    },
    {
      id: 906,
      title: "Welcome to CS 301 - Syllabus & Prerequisites Survey",
      posted_at: "2026-09-02T10:00:00Z",
      user_name: "Teaching Team",
      read_state: "read",
      message: "<p>Welcome everyone! Please review the syllabus in Module 1 and fill out the background prerequisites survey before this Friday so we can coordinate lab pairings.</p>"
    }
  ],
  modules: [
    {
      id: 1101,
      name: "Module 1: Foundations of Distributed Systems",
      state: "completed",
      items: [
        { id: 250, title: "Course Introduction & Setup", type: "SubHeader" },
        {
          id: 201,
          title: "Lecture 1: The Network Fallacies & Clock Synchronization",
          type: "Page",
          body: "<h3>Lecture 1 Overview</h3><p>Welcome to Distributed Systems. In this opening lecture, we dissect the Eight Fallacies of Distributed Computing first formulated by L. Peter Deutsch and James Gosling.</p><h4>The 8 Fallacies:</h4><ol><li>The network is reliable.</li><li>Latency is zero.</li><li>Bandwidth is infinite.</li><li>The network is secure.</li><li>Topology does not change.</li><li>There is one administrator.</li><li>Transport cost is zero.</li><li>The network is homogeneous.</li></ol><p>We also introduce physical quartz drift and why logical timestamps are required for causality.</p>",
          requirement: { completed: true }
        },
        { id: 202, title: "Reading: Lamport Logical Timestamps (PDF)", type: "File", content_id: 502, requirement: { completed: true } },
        { id: 220, title: "Official Documentation: Python AsyncIO Reference", type: "ExternalUrl", external_url: "https://docs.python.org/3/library/asyncio.html", requirement: { completed: true } },
        { id: 251, title: "Practical Assignments", type: "SubHeader" },
        { id: 203, title: "Lab 1: Asynchronous Remote Procedure Calls (RPC)", type: "Assignment", points: 50, requirement: { completed: true } }
      ]
    },
    {
      id: 1102,
      name: "Module 2: Fault Tolerance & Replication",
      state: "completed",
      items: [
        { id: 252, title: "Lectures & Readings", type: "SubHeader" },
        {
          id: 204,
          title: "Lecture 2: Primary-Backup Replication Architectures",
          type: "Page",
          body: "<h3>Primary-Backup Replication</h3><p>State machine replication requires consistent ordering of state transitions. Primary-backup protocols designate a leader node responsible for assigning sequence numbers to transactions before forwarding log entries to secondary standbys.</p><h4>Key Challenges:</h4><ul><li>Handling failover when heartbeat signals time out</li><li>Preventing split-brain situations where two nodes believe they are primary</li><li>Reconciliation after network partitions heal</li></ul>",
          requirement: { completed: true }
        },
        { id: 205, title: "Discussion: Split-Brain Scenarios in Distributed DBs", type: "Discussion", requirement: { completed: true } },
        { id: 212, title: "Notes: Vector Clocks & Causality Invariants (Markdown)", type: "File", content_id: 504, requirement: { completed: true } },
        { id: 253, title: "Assessments", type: "SubHeader" },
        { id: 206, title: "Problem Set 1: Vector Clocks & State Machines", type: "Assignment", points: 100, requirement: { completed: true } }
      ]
    },
    {
      id: 1103,
      name: "Module 3: Consensus & The Raft Protocol",
      state: "in-progress",
      items: [
        { id: 254, title: "Consensus Architecture", type: "SubHeader" },
        {
          id: 207,
          title: "Lecture 3: Raft Consensus Algorithm Walkthrough",
          type: "Page",
          body: "<h3>The Raft Consensus Algorithm</h3><p>Raft is designed for understandability while delivering equivalent safety guarantees to Multi-Paxos. Consensus decomposes into three independent subproblems:</p><ol><li><strong>Leader Election:</strong> Randomized timers ensure swift election of a unique leader.</li><li><strong>Log Replication:</strong> The leader accepts client entries and forces replicas to match its log.</li><li><strong>Safety:</strong> Only candidates with up-to-date logs can be elected.</li></ol>",
          requirement: { completed: true }
        },
        { id: 213, title: "Reading: Raft Consensus Protocol Specification (PDF)", type: "File", content_id: 505, requirement: { completed: false } },
        { id: 214, title: "Diagram: Network Partition & Quorum Topology (PNG)", type: "File", content_id: 506, requirement: { completed: false } },
        { id: 221, title: "Interactive Guide: The Secret Lives of Data (Raft)", type: "ExternalUrl", external_url: "https://thesecretlivesofdata.com/raft/", requirement: { completed: false } },
        { id: 255, title: "Implementation & Verification", type: "SubHeader" },
        { id: 208, title: "Project 2: Building Distributed Raft Consensus", type: "Assignment", points: 150, requirement: { completed: false } },
        { id: 209, title: "Quiz: Raft Election Invariants & Safety Rules", type: "Quiz", points: 20, requirement: { completed: false } }
      ]
    },
    {
      id: 1104,
      name: "Module 4: Scalable Cloud Storage & Distributed Transactions",
      state: "locked",
      items: [
        { id: 256, title: "Advanced Distributed Storage", type: "SubHeader" },
        {
          id: 210,
          title: "Lecture 4: Google Spanner & Two-Phase Commit",
          type: "Page",
          body: "<h3>Google Spanner Architecture</h3><p>Google Spanner provides externally consistent distributed transactions globally using TrueTime APIs backed by atomic clocks and GPS receivers.</p>",
          requirement: { completed: false }
        },
        { id: 215, title: "Source Code: Lab 1 Async RPC Skeleton (Python)", type: "File", content_id: 503, requirement: { completed: false } },
        { id: 211, title: "Project 3: Sharded Key-Value Storage Engine", type: "Assignment", points: 200, requirement: { completed: false } }
      ]
    }
  ],
  files: [
    {
      id: 501,
      display_name: "CS301_Syllabus_Fall2026.pdf",
      filename: "CS301_Syllabus_Fall2026.pdf",
      content_type: "application/pdf",
      size: 2450820,
      updated_at: "2026-09-02T10:00:00Z",
      url: "./assets/files/CS301_Syllabus_Fall2026.pdf",
      isLocal: true,
      description: "Official course syllabus, office hours schedule, grading breakdown, and academic integrity policies.",
      preview_type: "pdf",
      document_content: {
        title: "CS 301: Distributed Systems & Cloud Infrastructure",
        subtitle: "Course Syllabus & Policy Manual • Fall 2026 • Dr. Marcus Vance",
        sections: [
          {
            heading: "Course Description & Scope",
            body: "CS 301 provides an in-depth study of distributed systems, fault tolerance, consensus protocols, horizontal scalability, and cloud infrastructure architectures. Topics include RPC abstractions, logical clocks, state machine replication, Paxos and Raft consensus algorithms, and distributed storage engines."
          },
          {
            heading: "Lecture Logistics & Office Hours",
            body: "Lectures meet Tuesdays & Thursdays 10:00 AM - 11:30 AM in Engineering Hall 104. Office Hours are held Wednesdays 2:00 PM - 4:00 PM via Zoom and Gates Hall 412. Teaching assistants hold daily code review clinics in Room 218."
          },
          {
            heading: "Grading Policy Breakdown",
            table: [
              { item: "Programming Projects (Labs 1-4)", weight: "45%" },
              { item: "Midterm Examination", weight: "20%" },
              { item: "Final Distributed Key-Value Engine", weight: "25%" },
              { item: "Class Participation & Quizzes", weight: "10%" }
            ]
          },
          {
            heading: "Late Policy & Academic Integrity",
            callout: "Each student has 3 automatic late days total across all programming labs without penalty. All submitted code must be original individual work adhering to university ethics."
          }
        ]
      }
    },
    {
      id: 502,
      display_name: "Lamport_Logical_Clocks_1978.pdf",
      filename: "Lamport_Logical_Clocks_1978.pdf",
      content_type: "application/pdf",
      size: 1845120,
      updated_at: "2026-09-10T14:15:00Z",
      url: "./assets/files/Lamport_Logical_Clocks_1978.pdf",
      isLocal: true,
      description: "Seminal paper: Time, Clocks, and the Ordering of Events in a Distributed System (CACM 1978).",
      preview_type: "pdf",
      document_content: {
        title: "Time, Clocks, and the Ordering of Events in a Distributed System",
        subtitle: "Leslie Lamport • Communications of the ACM (Vol. 21, No. 7, July 1978)",
        sections: [
          {
            heading: "Abstract & Problem Statement",
            body: "The concept of one event happening before another in a distributed system is examined and is shown to define a partial ordering of the events. A distributed algorithm is given for synchronizing a system of logical clocks which can be used to totally order events and solve distributed mutual exclusion."
          },
          {
            heading: "The Partial Ordering Relation (->)",
            body: "The relation '->' (happens-before) is defined such that: (1) If a and b are events in the same process and a comes before b, then a -> b. (2) If a is the sending of a message by one process and b is its receipt, then a -> b. (3) If a -> b and b -> c, then a -> c. Two events are concurrent (a || b) if neither precedes the other."
          },
          {
            heading: "Clock Condition Rules",
            table: [
              { rule: "Rule IR1", desc: "Each process Pi increments Ci between any two successive local events: Ci = Ci + 1." },
              { rule: "Rule IR2(a)", desc: "If event a sends message m, message m contains timestamp Tm = Ci(a)." },
              { rule: "Rule IR2(b)", desc: "Upon receiving message m, process Pj sets Cj = max(Cj, Tm) + 1." }
            ]
          },
          {
            heading: "State Machine Replication Application",
            callout: "Logical clocks enable totally ordered request queues across distributed nodes, providing fair mutex and state machine replication without centralized coordinators."
          }
        ]
      }
    },
    {
      id: 503,
      display_name: "lab1_rpc_starter.py",
      filename: "lab1_rpc_starter.py",
      content_type: "text/x-python",
      size: 14200,
      updated_at: "2026-09-15T18:30:00Z",
      isLocal: true,
      description: "Asynchronous RPC client and server skeleton code with socket timeout handlers.",
      preview_type: "code",
      code_content: `import asyncio
import json
import logging
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DistributedRPC")

class AsyncRPCServer:
    """Asynchronous Remote Procedure Call Server implementation for Lab 1."""
    
    def __init__(self, host: str = "127.0.0.1", port: int = 8080):
        self.host = host
        self.port = port
        self.registry: Dict[str, Any] = {}
        self._server: Optional[asyncio.Server] = None
        
    def register_method(self, name: str, handler):
        self.registry[name] = handler
        logger.info(f"Registered RPC method: {name}")

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        data = await reader.read(4096)
        try:
            req = json.loads(data.decode())
            method = req.get("method")
            params = req.get("params", {})
            req_id = req.get("id")
            
            if method in self.registry:
                res = await self.registry[method](**params)
                payload = json.dumps({"jsonrpc": "2.0", "result": res, "id": req_id})
            else:
                payload = json.dumps({"jsonrpc": "2.0", "error": f"Method {method} not found", "id": req_id})
        except Exception as e:
            payload = json.dumps({"jsonrpc": "2.0", "error": str(e), "id": None})
            
        writer.write(payload.encode())
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def start(self):
        self._server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logger.info(f"RPC Server listening on {self.host}:{self.port}")
        async with self._server:
            await self._server.serve_forever()

if __name__ == "__main__":
    server = AsyncRPCServer()
    asyncio.run(server.start())`
    },
    {
      id: 504,
      display_name: "vector_clocks_notes.md",
      filename: "vector_clocks_notes.md",
      content_type: "text/markdown",
      size: 8320,
      updated_at: "2026-09-22T11:45:00Z",
      isLocal: true,
      description: "Key vector clock invariants: causality, concurrent events detection, and state machine replication.",
      preview_type: "markdown",
      text_content: `# Vector Clocks & State Machine Replication

## Summary
A vector clock is an algorithm for generating a partial ordering of events in a distributed system and detecting causality violations.

### Mathematical Invariants
1. **Clock Vector**: Each node maintains a vector V of size N.
2. **Local Event**: Process increments its own component V[i] += 1.
3. **Message Send**: Process sends timestamp vector V with message.
4. **Message Receive**: Recipient takes component-wise max:
   V[k] = max(V[k], V_msg[k]), then increments V[i] += 1.

### Causality Comparison
- Event A happens before B (A -> B) iff V(A) <= V(B) and V(A) != V(B).
- Concurrent events (A || B) occur when neither dominates.`
    },
    {
      id: 505,
      display_name: "Raft_Consensus_Spec_v2.pdf",
      filename: "Raft_Consensus_Spec_v2.pdf",
      content_type: "application/pdf",
      size: 3140500,
      updated_at: "2026-10-01T09:20:00Z",
      url: "./assets/files/Raft_Consensus_Spec_v2.pdf",
      isLocal: true,
      description: "In Search of an Understandable Consensus Algorithm (Diego Ongaro & John Ousterhout).",
      preview_type: "pdf",
      document_content: {
        title: "In Search of an Understandable Consensus Algorithm (Raft)",
        subtitle: "Diego Ongaro & John Ousterhout • Stanford University (USENIX ATC 2014)",
        sections: [
          {
            heading: "Overview & Design Philosophy",
            body: "Raft is a consensus algorithm for managing a replicated log. It produces a result equivalent to (multi-)Paxos and is as efficient as Paxos, but its structure is decomposed to improve understandability, implementation safety, and verification in distributed production engines."
          },
          {
            heading: "Decomposed Subproblems in Raft",
            body: "Raft separates consensus into 3 independent subproblems: (1) Leader Election: electing a recognized leader upon failure of an existing leader. (2) Log Replication: accepting log entries from clients and propagating them to followers. (3) Safety: ensuring that if any server applied a log entry at index k, no server will ever apply a different entry at k."
          },
          {
            heading: "Raft Key State & Invariants",
            table: [
              { invariant: "Election Safety", guarantee: "At most one leader can be elected in a given term." },
              { invariant: "Leader Append-Only", guarantee: "A leader never overwrites or truncates its log; it only appends." },
              { invariant: "Log Matching", guarantee: "If two logs share an entry with same index & term, logs match up to that index." },
              { invariant: "Leader Completeness", guarantee: "If a log entry is committed in term T, it is present in logs of all leaders for terms > T." }
            ]
          },
          {
            heading: "RPC Specification Note",
            callout: "Raft servers communicate via two core RPCs: RequestVote (for election ballots) and AppendEntries (for log replication and heartbeats). Heartbeat timeouts prevent split elections."
          }
        ]
      }
    },
    {
      id: 506,
      display_name: "network_partition_diagram.png",
      filename: "network_partition_diagram.png",
      content_type: "image/png",
      size: 612400,
      updated_at: "2026-10-04T16:10:00Z",
      url: "./assets/files/network_partition_diagram.png",
      isLocal: true,
      description: "Cluster split-brain network topology and quorum leader election boundaries.",
      preview_type: "image"
    }
  ],
  assignments: [
    {
      id: 301,
      name: "Lab 1: Asynchronous Remote Procedure Calls (RPC)",
      due_at: "2026-09-18T23:59:00Z",
      points_possible: 50,
      submission_types: ["online_upload"],
      html_url: "https://canvas.instructure.com/courses/demo/assignments/301",
      description: "<h3>Lab 1: Asynchronous Remote Procedure Calls (RPC)</h3><p>In this laboratory assignment, you will construct a high-throughput, non-blocking Remote Procedure Call (RPC) client and server library in Python utilizing standard <code>asyncio</code> primitives.</p><h4>Assignment Objectives:</h4><ul><li>Implement a custom binary framing layer on top of raw TCP streams to delineate request/response boundaries.</li><li>Serialize arguments and return values using JSON-RPC 2.0 schemas with schema validation.</li><li>Handle transient network failures using an exponential backoff retry mechanism with randomized jitter.</li><li>Guarantee at-most-once execution semantics for mutating operations through idempotent sequence numbers.</li></ul><h4>Deliverables & Submission:</h4><p>Submit your repository archive containing <code>rpc_client.py</code>, <code>rpc_server.py</code>, and a unit test suite demonstrating recovery under simulated network packet drops.</p>",
      submission: {
        workflow_state: "graded",
        score: 50,
        grade: "100%",
        submitted_at: "2026-09-17T20:12:00Z",
        body: "Submitted lab1_rpc_final.zip containing all required modules and unit tests passing 100%."
      }
    },
    {
      id: 302,
      name: "Problem Set 1: Vector Clocks & State Machines",
      due_at: "2026-09-28T23:59:00Z",
      points_possible: 100,
      submission_types: ["online_upload", "online_text_entry"],
      html_url: "https://canvas.instructure.com/courses/demo/assignments/302",
      description: "<h3>Problem Set 1: Vector Clocks & State Machines</h3><p>This problem set evaluates your rigorous theoretical understanding of causality tracking in asynchronous networks where no physical synchronized master clock exists.</p><h4>Problems:</h4><ol><li><strong>Vector Clock Invariant Proof:</strong> Formally prove that for two distinct events <em>a</em> and <em>b</em> in distributed space, <em>a &rarr; b</em> if and only if <em>V(a) &lt; V(b)</em>.</li><li><strong>Causality Anomaly Analysis:</strong> Given the 3-process message trace diagram, assign exact vector timestamps to each event and identify any concurrent event pairs.</li><li><strong>State Machine Consistency:</strong> Explain why Total Order Broadcast is equivalent to consensus and demonstrate how vector clocks resolve state machine log divergences.</li></ol><h4>Submission:</h4><p>Typeset your proofs in LaTeX or export as a clean PDF.</p>",
      submission: {
        workflow_state: "graded",
        score: 95,
        grade: "95%",
        submitted_at: "2026-09-28T18:45:00Z",
        body: "Uploaded pset1_vector_clocks.pdf. Scored 95/100 (Deduction: -5 on question 2b for missing Lamport causal diagram edge)."
      }
    },
    {
      id: 303,
      name: "Project 2: Building Distributed Raft Consensus",
      due_at: "2026-10-18T23:59:00Z",
      points_possible: 150,
      submission_types: ["online_upload"],
      html_url: "https://canvas.instructure.com/courses/demo/assignments/303",
      description: "<h3>Project 2: Building Distributed Raft Consensus</h3><p>In this milestone project, you will implement the Raft distributed consensus protocol from scratch according to the Stanford specification paper.</p><h4>Architecture Phases:</h4><ul><li><strong>Phase 1: Leader Election:</strong> Implement randomized heartbeat timers (150ms&ndash;300ms), <code>RequestVote</code> RPC handling, candidate state transitions, and term increment invariants.</li><li><strong>Phase 2: Log Replication:</strong> Implement <code>AppendEntries</code> RPC logic, log matching consistency checks, commit index advancement, and leader log overwrite mechanisms.</li><li><strong>Phase 3: Crash Recovery & Persistence:</strong> Persist <code>currentTerm</code>, <code>votedFor</code>, and <code>log</code> to durable storage prior to acknowledging RPCs.</li></ul><h4>Testing:</h4><p>Your code will be evaluated against our test harness simulating partitioned quorums, network partitions, and erratic leader crashes.</p>",
      submission: { workflow_state: "unsubmitted", score: null, grade: null }
    },
    {
      id: 304,
      name: "Quiz: Raft Election Invariants & Safety Rules",
      due_at: "2026-10-22T23:59:00Z",
      points_possible: 20,
      submission_types: ["online_quiz"],
      html_url: "https://canvas.instructure.com/courses/demo/assignments/304",
      description: "<h3>Quiz: Raft Election Invariants & Safety Rules</h3><p>A 20-minute timed quiz assessing core consensus invariants: Leader Append-Only property, Log Matching property, Leader Completeness, and State Machine Safety rules.</p><p>You will have 1 attempt. Once started, the timer cannot be paused.</p>",
      submission: { workflow_state: "unsubmitted", score: null, grade: null }
    },
    {
      id: 305,
      name: "Project 3: Sharded Key-Value Storage Engine",
      due_at: "2026-11-12T23:59:00Z",
      points_possible: 200,
      submission_types: ["online_upload"],
      html_url: "https://canvas.instructure.com/courses/demo/assignments/305",
      description: "<h3>Project 3: Sharded Key-Value Storage Engine</h3><p>Design and implement a horizontally scalable, partitioned key-value storage system utilizing consistent hashing and Raft-replicated shards.</p><h4>System Requirements:</h4><ul><li>Shard master coordinator allocating virtual node tokens and balancing bucket ranges.</li><li>Client library caching configuration metadata and routing requests with <code>MOVED</code> redirects.</li><li>Live shard migration without service interruption or inconsistent reads.</li></ul>",
      submission: { workflow_state: "unsubmitted", score: null, grade: null }
    }
  ]
};

// Global State
let appState = {
  activeView: 'auth', // 'auth' | 'home' | 'course' | 'settings'
  currentDomain: 'canvas.instructure.com',
  currentToken: '',
  profileData: null,
  courses: [],
  activeCourse: null,
  courseDetails: null,
  activeCourseTab: 'announcements', // 'announcements' | 'modules' | 'assignments' | 'files' | 'grades'
  assignmentFilter: 'all',
  isDemo: false,
  isOffline: false,
  rawJsonString: '',
  sidebarCollapsed: false,
  activeFile: null,
  tabs: [],
  activeTabId: null,
  courseDetailsCache: {},
  fileTextCache: {},
  globalSearchCourseFilter: 'all',
  globalSearchTypeFilter: 'all',
  globalSearchHighlightedIndex: -1,
  aiDrawerOpen: false,
  aiActiveCourseId: 'all',
  aiIsGenerating: false,
  aiModelList: [],
  scheduleEvents: [],
  scheduleIcalUrl: '',
  inboxConversations: [],
  inboxScope: 'inbox',
  inboxCourseFilter: 'all',
  activeConversationId: null,
  inboxSearchQuery: '',
  notes: [],
  activeNoteId: null,
  notesStoragePath: '',
  notesCourseFilter: 'all',
  notesSearchQuery: '',
  archivedCourseIds: new Set()
};
window.appState = appState;

function isUserAuthenticated() {
  const hasToken = Boolean(appState.currentToken && appState.currentToken.trim().length > 0);
  const isDemo = Boolean(appState.isDemo);
  const isOfflineValid = Boolean(appState.isOffline && appState.courses && appState.courses.length > 0);
  return hasToken || isDemo || isOfflineValid;
}

// Centralized Global Search Elements
const topSearchTriggerBar = document.getElementById('topSearchTriggerBar');
const topSearchCourseBadge = document.getElementById('topSearchCourseBadge');
const topSearchCourseLabel = document.getElementById('topSearchCourseLabel');
const topSearchPlaceholder = document.getElementById('topSearchPlaceholder');
const searchPageOverlay = document.getElementById('searchPageOverlay');
const searchPageBackdrop = document.getElementById('searchPageBackdrop');
const searchPageContainer = document.getElementById('searchPageContainer');
const searchPageBar = document.getElementById('searchPageBar');
const searchPageCloseBtn = document.getElementById('searchPageCloseBtn');
const searchPageCourseChips = document.getElementById('searchPageCourseChips');
const globalSearchCourseSelect = document.getElementById('globalSearchCourseSelect');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchClearBtn = document.getElementById('globalSearchClearBtn');
const globalSearchResultsPanel = document.getElementById('globalSearchResultsPanel');
const globalSearchResultsCount = document.getElementById('globalSearchResultsCount');
const globalSearchTypeFilters = document.getElementById('globalSearchTypeFilters');
const globalSearchResultsList = document.getElementById('globalSearchResultsList');

// DOM Elements
const appLoadingScreen = document.getElementById('appLoadingScreen');
const loadingStatusText = document.getElementById('loadingStatusText');
const authSection = document.getElementById('authSection');
const homeSection = document.getElementById('homeSection');
const coursePageSection = document.getElementById('coursePageSection');
const settingsProfileSection = document.getElementById('settingsProfileSection');
const moduleReaderSection = document.getElementById('moduleReaderSection');
const aiPageSection = document.getElementById('aiPageSection');
const moduleReaderContent = document.getElementById('moduleReaderContent');
const readerBackToCourseBtn = document.getElementById('readerBackToCourseBtn');
const readerBackBtnLabel = document.getElementById('readerBackBtnLabel');
const readerItemIcon = document.getElementById('readerItemIcon');
const readerItemTitle = document.getElementById('readerItemTitle');
const readerCourseName = document.getElementById('readerCourseName');
const readerModuleName = document.getElementById('readerModuleName');
const readerOpenAppBtn = document.getElementById('readerOpenAppBtn');
const readerRevealFinderBtn = document.getElementById('readerRevealFinderBtn');
const readerExternalBtn = document.getElementById('readerExternalBtn');

// Windowbar & Browser Tab Elements
const titlebarLeft = document.getElementById('titlebarLeft');
const titlebarCourseBreadcrumb = document.getElementById('titlebarCourseBreadcrumb');
const titlebarCourseName = document.getElementById('titlebarCourseName');
const navSettingsBtn = document.getElementById('navSettingsBtn');
const sidebarExpandBtn = document.getElementById('sidebarExpandBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

// Browser Tab Elements
const browserTabBar = document.getElementById('browserTabBar');
const browserTabList = document.getElementById('browserTabList');
const browserTabScrollContainer = document.getElementById('browserTabScrollContainer');
const browserNewTabBtn = document.getElementById('browserNewTabBtn');
const browserNavBackBtn = document.getElementById('browserNavBackBtn');
const browserNavForwardBtn = document.getElementById('browserNavForwardBtn');
const browserNavReloadBtn = document.getElementById('browserNavReloadBtn');
const customContextMenu = document.getElementById('customContextMenu');

// Auth Form Elements
const initialAuthForm = document.getElementById('initialAuthForm');
const canvasDomainInput = document.getElementById('canvasDomain');
const accessTokenInput = document.getElementById('accessToken');
const rememberCredentialsCheckbox = document.getElementById('rememberCredentials');
const submitAuthBtn = document.getElementById('submitAuthBtn');
const authSpinner = document.getElementById('authSpinner');
const authError = document.getElementById('authError');
const authErrorMsg = document.getElementById('authErrorMsg');
const loadDemoBtn = document.getElementById('loadDemoBtn');
const toggleTokenVisibilityBtn = document.getElementById('toggleTokenVisibility');

// Layout & Sidebar Elements
const appSidebar = document.getElementById('appSidebar');
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const sidebarHomeBtn = document.getElementById('sidebarHomeBtn');
const sidebarCalendarBtn = document.getElementById('sidebarCalendarBtn');
const sidebarAssignmentsBtn = document.getElementById('sidebarAssignmentsBtn');
const sidebarAssignmentsBadge = document.getElementById('sidebarAssignmentsBadge');
const sidebarAnnouncementsBtn = document.getElementById('sidebarAnnouncementsBtn');
const sidebarAnnouncementsBadge = document.getElementById('sidebarAnnouncementsBadge');
const sidebarInboxBtn = document.getElementById('sidebarInboxBtn');
const sidebarInboxBadge = document.getElementById('sidebarInboxBadge');
const sidebarNotesBtn = document.getElementById('sidebarNotesBtn');
const sidebarNotesCount = document.getElementById('sidebarNotesCount');
const sidebarAiBtn = document.getElementById('sidebarAiBtn');
const sidebarCoursesList = document.getElementById('sidebarCoursesList');
const sidebarCoursesCount = document.getElementById('sidebarCoursesCount');
const sidebarCoursesSettingsBtn = document.getElementById('sidebarCoursesSettingsBtn');
const sidebarProfileCard = document.getElementById('sidebarProfileCard');
const sidebarProfileMenu = document.getElementById('sidebarProfileMenu');
const sidebarMenuProfileBtn = document.getElementById('sidebarMenuProfileBtn');
const sidebarMenuSettingsBtn = document.getElementById('sidebarMenuSettingsBtn');
const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
const sidebarAvatarFallback = document.getElementById('sidebarAvatarFallback');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserRole = document.getElementById('sidebarUserRole');
const sidebarUserStudentId = document.getElementById('sidebarUserStudentId') || document.getElementById('sidebarUserInstitution');
const sidebarUserInstitution = sidebarUserStudentId;

// Dedicated Calendar Page Elements
const calendarPageSection = document.getElementById('calendarPageSection');
const calPageSyncStatusPill = document.getElementById('calPageSyncStatusPill');
const calPageSyncLabel = document.getElementById('calPageSyncLabel');
const calPageSyncBtn = document.getElementById('calPageSyncBtn');
const calPageSettingsLinkBtn = document.getElementById('calPageSettingsLinkBtn');
const calPagePrevBtn = document.getElementById('calPagePrevBtn');
const calPageMonthLabel = document.getElementById('calPageMonthLabel');
const calPageNextBtn = document.getElementById('calPageNextBtn');
const calPageTodayBtn = document.getElementById('calPageTodayBtn');
const calPageViewDropdownBtn = document.getElementById('calPageViewDropdownBtn');
const calPageViewSelectedLabel = document.getElementById('calPageViewSelectedLabel');
const calPageViewMenu = document.getElementById('calPageViewMenu');
const calPageViewDropdownContainer = document.getElementById('calPageViewDropdownContainer');
const calPageViewSwitcher = document.getElementById('calPageViewSwitcher');
const calPageWeekdays = document.getElementById('calPageWeekdays');
const calPageGrid = document.getElementById('calPageGrid');
const calPageAgendaCard = document.getElementById('calPageAgendaCard');
const calPageAgendaDateTitle = document.getElementById('calPageAgendaDateTitle');
const calPageAgendaBadge = document.getElementById('calPageAgendaBadge');
const calPageAgendaList = document.getElementById('calPageAgendaList');

// Dedicated Assignments & Announcements Page Elements
const assignmentsPageSection = document.getElementById('assignmentsPageSection');
const assignmentsPageCountBadge = document.getElementById('assignmentsPageCountBadge');
const assignmentsPageSearchInput = document.getElementById('assignmentsPageSearchInput');
const assignmentsPageCourseSelect = document.getElementById('assignmentsPageCourseSelect');
const assignmentsPageSortSelect = document.getElementById('assignmentsPageSortSelect');
const assignmentsPageGrid = document.getElementById('assignmentsPageGrid');

const announcementsPageSection = document.getElementById('announcementsPageSection');
const announcementsPageCountBadge = document.getElementById('announcementsPageCountBadge');
const announcementsPageSearchInput = document.getElementById('announcementsPageSearchInput');
const announcementsPageCourseSelect = document.getElementById('announcementsPageCourseSelect');
const announcementsPageFeed = document.getElementById('announcementsPageFeed');

// Dedicated Inbox & Conversations Elements
const inboxPageSection = document.getElementById('inboxPageSection');
const inboxRefreshBtn = document.getElementById('inboxRefreshBtn');
const inboxComposeBtn = document.getElementById('inboxComposeBtn');
const inboxFilterBtn = document.getElementById('inboxFilterBtn');
const inboxFilterMenu = document.getElementById('inboxFilterMenu');
const inboxScopeFilterOptions = document.getElementById('inboxScopeFilterOptions');
const inboxCourseFilterOptions = document.getElementById('inboxCourseFilterOptions');
const inboxScopeTabs = document.getElementById('inboxScopeTabs');
const scopeCountInbox = document.getElementById('scopeCountInbox');
const scopeCountUnread = document.getElementById('scopeCountUnread');
const inboxCourseFilter = document.getElementById('inboxCourseFilter');
const inboxSearchInput = document.getElementById('inboxSearchInput');
const inboxSearchClearBtn = document.getElementById('inboxSearchClearBtn');
const inboxConversationsList = document.getElementById('inboxConversationsList');
const inboxDetailPane = document.getElementById('inboxDetailPane');
const inboxThreadEmptyState = document.getElementById('inboxThreadEmptyState');
const inboxEmptyComposeBtn = document.getElementById('inboxEmptyComposeBtn');
const inboxThreadCard = document.getElementById('inboxThreadCard');
const inboxThreadSubject = document.getElementById('inboxThreadSubject');
const inboxThreadContextBadge = document.getElementById('inboxThreadContextBadge');
const inboxThreadMessageCount = document.getElementById('inboxThreadMessageCount');
const inboxThreadParticipants = document.getElementById('inboxThreadParticipants');
const inboxThreadStarBtn = document.getElementById('inboxThreadStarBtn');
const inboxMessagesList = document.getElementById('inboxMessagesList');
const inboxReplySection = document.getElementById('inboxReplySection');
const inboxReplyForm = document.getElementById('inboxReplyForm');
const inboxReplyText = document.getElementById('inboxReplyText');
const inboxReplySendBtn = document.getElementById('inboxReplySendBtn');

// Inbox Compose Modal Elements
const inboxComposeModal = document.getElementById('inboxComposeModal');
const closeInboxComposeModalBtn = document.getElementById('closeInboxComposeModalBtn');
const inboxComposeForm = document.getElementById('inboxComposeForm');
const inboxComposeCourseSelect = document.getElementById('inboxComposeCourseSelect');
const inboxComposeRecipientsInput = document.getElementById('inboxComposeRecipientsInput');
const inboxComposeSubjectInput = document.getElementById('inboxComposeSubjectInput');
const inboxComposeBodyText = document.getElementById('inboxComposeBodyText');
const inboxComposeCancelBtn = document.getElementById('inboxComposeCancelBtn');
const inboxComposeSubmitBtn = document.getElementById('inboxComposeSubmitBtn');

// Dedicated Notes Page Elements
const notesPageSection = document.getElementById('notesPageSection');
const notesStorageFolderBtn = document.getElementById('notesStorageFolderBtn');
const notesStoragePathLabel = document.getElementById('notesStoragePathLabel');
const notesNewBtn = document.getElementById('notesNewBtn');
const notesFilterBtn = document.getElementById('notesFilterBtn');
const notesCourseFilterMenu = document.getElementById('notesCourseFilterMenu');
const notesCourseFilterOptions = document.getElementById('notesCourseFilterOptions');
const notesCourseFilter = document.getElementById('notesCourseFilter');
const notesSearchInput = document.getElementById('notesSearchInput');
const notesSearchClearBtn = document.getElementById('notesSearchClearBtn');
const notesList = document.getElementById('notesList');
const notesDetailPane = document.getElementById('notesDetailPane');
const noteEditorEmptyState = document.getElementById('noteEditorEmptyState');
const noteEmptyNewBtn = document.getElementById('noteEmptyNewBtn');
const noteEditorCard = document.getElementById('noteEditorCard');
const noteTitleInput = document.getElementById('noteTitleInput');
const noteSaveStatus = document.getElementById('noteSaveStatus');
const noteSaveBtn = document.getElementById('noteSaveBtn');
const noteDeleteBtn = document.getElementById('noteDeleteBtn');
const noteCourseSelect = document.getElementById('noteCourseSelect');
const noteSessionSelect = document.getElementById('noteSessionSelect');
const noteSessionPickerBtn = document.getElementById('noteSessionPickerBtn');
const noteSessionSelectedText = document.getElementById('noteSessionSelectedText');
const noteStorageLocationBadge = document.getElementById('noteStorageLocationBadge');
const noteLinkedFilesList = document.getElementById('noteLinkedFilesList');
const noteLinkFileBtn = document.getElementById('noteLinkFileBtn');
const noteFormatToolbar = document.getElementById('noteFormatToolbar');
const formatBlockSelect = document.getElementById('formatBlockSelect');
const formatBoldBtn = document.getElementById('formatBoldBtn');
const formatItalicBtn = document.getElementById('formatItalicBtn');
const formatUnderlineBtn = document.getElementById('formatUnderlineBtn');
const formatStrikeBtn = document.getElementById('formatStrikeBtn');
const formatHighlightBtn = document.getElementById('formatHighlightBtn');
const formatBulletListBtn = document.getElementById('formatBulletListBtn');
const formatNumberListBtn = document.getElementById('formatNumberListBtn');
const formatQuoteBtn = document.getElementById('formatQuoteBtn');
const formatHrBtn = document.getElementById('formatHrBtn');
const formatLinkBtn = document.getElementById('formatLinkBtn');
const formatInsertMediaBtn = document.getElementById('formatInsertMediaBtn');
const noteMediaFileInput = document.getElementById('noteMediaFileInput');
const formatClearBtn = document.getElementById('formatClearBtn');
const noteWordCount = document.getElementById('noteWordCount');
const noteContentEditor = document.getElementById('noteContentEditor');

// Link Course File Modal Elements
const noteLinkFileModal = document.getElementById('noteLinkFileModal');
const closeNoteLinkFileModalBtn = document.getElementById('closeNoteLinkFileModalBtn');
const noteLinkFileSearchInput = document.getElementById('noteLinkFileSearchInput');
const noteLinkFileOptionsList = document.getElementById('noteLinkFileOptionsList');
const noteLinkFileCancelBtn = document.getElementById('noteLinkFileCancelBtn');

// Link Calendar Session Modal Elements
const noteSessionCalendarModal = document.getElementById('noteSessionCalendarModal');
const closeNoteSessionModalBtn = document.getElementById('closeNoteSessionModalBtn');
const noteCalPrevMonthBtn = document.getElementById('noteCalPrevMonthBtn');
const noteCalNextMonthBtn = document.getElementById('noteCalNextMonthBtn');
const noteCalTodayBtn = document.getElementById('noteCalTodayBtn');
const noteCalMonthTitle = document.getElementById('noteCalMonthTitle');
const noteCalDaysGrid = document.getElementById('noteCalDaysGrid');
const noteCalSessionsDateLabel = document.getElementById('noteCalSessionsDateLabel');
const noteCalSessionsList = document.getElementById('noteCalSessionsList');
const noteSessionSearchInput = document.getElementById('noteSessionSearchInput');
const noteSessionClearBtn = document.getElementById('noteSessionClearBtn');
const noteSessionCancelBtn = document.getElementById('noteSessionCancelBtn');

// Home / Courses Elements
const homeUserAvatar = document.getElementById('homeUserAvatar');
const homeAvatarFallback = document.getElementById('homeAvatarFallback');
const homeGreetingName = document.getElementById('homeGreetingName');
const coursesCountVal = document.getElementById('coursesCountVal');
const activeTermVal = document.getElementById('activeTermVal');
const refreshCoursesBtn = document.getElementById('refreshCoursesBtn');
const courseSearchInput = document.getElementById('courseSearchInput');
const termFilterSelect = document.getElementById('termFilterSelect');
const coursesGrid = document.getElementById('coursesGrid');
const emptyCoursesState = document.getElementById('emptyCoursesState');
const resetCourseFilterBtn = document.getElementById('resetCourseFilterBtn');

// Home Dashboard Widgets Elements
const homeWidgetsContainer = document.getElementById('homeWidgetsContainer');
const homeCalendarMonthLabel = document.getElementById('homeCalendarMonthLabel');
const homeCalPrevBtn = document.getElementById('homeCalPrevBtn');
const homeCalTodayBtn = document.getElementById('homeCalTodayBtn');
const homeCalNextBtn = document.getElementById('homeCalNextBtn');
const homeCalViewSwitcher = document.getElementById('homeCalViewSwitcher');
const homeCalendarBody = document.getElementById('homeCalendarBody');
const homeCalendarWeekdays = document.getElementById('homeCalendarWeekdays');
const homeCalendarGrid = document.getElementById('homeCalendarGrid');
const homeCalendarDetailPanel = document.getElementById('homeCalendarDetailPanel');
const homeCalDetailTitle = document.getElementById('homeCalDetailTitle');
const homeCalDetailBadge = document.getElementById('homeCalDetailBadge');
const homeCalDetailCloseBtn = document.getElementById('homeCalDetailCloseBtn');
const homeCalDetailList = document.getElementById('homeCalDetailList');
const homeAssignmentsWidgetTitle = document.getElementById('homeAssignmentsWidgetTitle');
const homeAssignmentsBadge = document.getElementById('homeAssignmentsBadge');
const homeAssignmentsScrollList = document.getElementById('homeAssignmentsScrollList');
const homeAnnouncementsBadge = document.getElementById('homeAnnouncementsBadge');
const homeAnnouncementsScrollList = document.getElementById('homeAnnouncementsScrollList');

// Reworked Dashboard Widgets & Greeting Elements (Reference Design)
const homeGreetingSubtitle = document.getElementById('homeGreetingSubtitle');
const welcomeAssignmentsQuickBtn = document.getElementById('welcomeAssignmentsQuickBtn');
const welcomeAnnouncementsQuickBtn = document.getElementById('welcomeAnnouncementsQuickBtn');
const homeViewAllAssignmentsBtn = document.getElementById('homeViewAllAssignmentsBtn');
const homeViewAllAnnouncementsBtn = document.getElementById('homeViewAllAnnouncementsBtn');

const dashAssignHeroPending = document.getElementById('dashAssignHeroPending');
const dashAssignSubPending = document.getElementById('dashAssignSubPending');
const dashAssignDotsPending = document.getElementById('dashAssignDotsPending');
const dashAssignPillPending = document.getElementById('dashAssignPillPending');
const dashAssignPillPendingText = document.getElementById('dashAssignPillPendingText');

const dashAssignHeroCompleted = document.getElementById('dashAssignHeroCompleted');
const dashAssignSubCompleted = document.getElementById('dashAssignSubCompleted');
const dashAssignDotsCompleted = document.getElementById('dashAssignDotsCompleted');
const dashAssignPillCompleted = document.getElementById('dashAssignPillCompleted');
const dashAssignPillCompletedText = document.getElementById('dashAssignPillCompletedText');

const dashAnnounceHeroUnread = document.getElementById('dashAnnounceHeroUnread');
const dashAnnounceDotsUnread = document.getElementById('dashAnnounceDotsUnread');
const dashAnnouncePillUnreadText = document.getElementById('dashAnnouncePillUnreadText');

const dashAnnounceHeroActive = document.getElementById('dashAnnounceHeroActive');
const dashAnnounceDotsActive = document.getElementById('dashAnnounceDotsActive');
const dashAnnouncePillActiveText = document.getElementById('dashAnnouncePillActiveText');

const dashAnnounceCardHero = document.getElementById('dashAnnounceCardHero');
const dashAnnounceHeroDate = document.getElementById('dashAnnounceHeroDate');
const dashAnnounceHeroDot = document.getElementById('dashAnnounceHeroDot');
const dashAnnounceHeroCourse = document.getElementById('dashAnnounceHeroCourse');
const dashAnnounceHeroTitle = document.getElementById('dashAnnounceHeroTitle');
const dashAnnounceHeroSnippet = document.getElementById('dashAnnounceHeroSnippet');
const dashAnnounceHeroPill = document.getElementById('dashAnnounceHeroPill');
const dashAnnounceHeroPillText = document.getElementById('dashAnnounceHeroPillText');

const homeWidgetCalendar = document.getElementById('homeWidgetCalendar');
const homeTopWidgetsRow = document.getElementById('homeTopWidgetsRow');
const dashCalHeroClasses = document.getElementById('dashCalHeroClasses');
const dashCalSubClasses = document.getElementById('dashCalSubClasses');
const dashCalDotsClasses = document.getElementById('dashCalDotsClasses');
const dashCalPillClasses = document.getElementById('dashCalPillClasses');
const dashCalPillClassesText = document.getElementById('dashCalPillClassesText');
const dashCalHeroDues = document.getElementById('dashCalHeroDues');
const dashCalSubDues = document.getElementById('dashCalSubDues');
const dashCalDotsDues = document.getElementById('dashCalDotsDues');
const dashCalPillDues = document.getElementById('dashCalPillDues');
const dashCalPillDuesText = document.getElementById('dashCalPillDuesText');
const homeCalendarAgendaSubheading = document.getElementById('homeCalendarAgendaSubheading');
const homeCalendarTotalBadge = document.getElementById('homeCalendarTotalBadge');

// Course Page Elements
const courseBackToHomeBtn = document.getElementById('courseBackToHomeBtn');
const courseOpenExternalBtn = document.getElementById('courseOpenExternalBtn');
const refreshCourseDetailsBtn = document.getElementById('refreshCourseDetailsBtn');
const courseHeaderCode = document.getElementById('courseHeaderCode');
const courseHeaderTerm = document.getElementById('courseHeaderTerm');
const courseHeaderGrade = document.getElementById('courseHeaderGrade');
const courseHeaderTitle = document.getElementById('courseHeaderTitle');
const courseHeaderTeacher = document.getElementById('courseHeaderTeacher');
const courseHeroAccent = document.getElementById('courseHeroAccent');
const courseHeroIconBadge = document.getElementById('courseHeroIconBadge');
const courseCustomizeBtn = document.getElementById('courseCustomizeBtn');

// Course Tabs
const tabBtnAnnouncements = document.getElementById('tabBtnAnnouncements');
const tabBtnModules = document.getElementById('tabBtnModules');
const tabBtnAssignments = document.getElementById('tabBtnAssignments');
const tabBtnFiles = document.getElementById('tabBtnFiles');
const tabBtnGrades = document.getElementById('tabBtnGrades');
const badgeAnnouncementsCount = document.getElementById('badgeAnnouncementsCount');
const badgeModulesCount = document.getElementById('badgeModulesCount');
const badgeAssignmentsCount = document.getElementById('badgeAssignmentsCount');
const badgeFilesCount = document.getElementById('badgeFilesCount');
const badgeGradesSummary = document.getElementById('badgeGradesSummary');

// Course Panes
const paneAnnouncements = document.getElementById('paneAnnouncements');
const paneModules = document.getElementById('paneModules');
const paneAssignments = document.getElementById('paneAssignments');
const paneFiles = document.getElementById('paneFiles');
const paneGrades = document.getElementById('paneGrades');
const announcementsList = document.getElementById('announcementsList');
const emptyAnnouncementsState = document.getElementById('emptyAnnouncementsState');
const announcementSearchInput = document.getElementById('announcementSearchInput');
const modulesList = document.getElementById('modulesList');
const emptyModulesState = document.getElementById('emptyModulesState');
const assignmentsList = document.getElementById('assignmentsList');
const emptyAssignmentsState = document.getElementById('emptyAssignmentsState');
const filesSearchInput = document.getElementById('filesSearchInput');
const courseFilesList = document.getElementById('courseFilesList');
const emptyFilesState = document.getElementById('emptyFilesState');
const downloadAllFilesBtn = document.getElementById('downloadAllFilesBtn');

// Right Side File Preview Elements
const filePreviewPanel = document.getElementById('filePreviewPanel');
const previewFileIcon = document.getElementById('previewFileIcon');
const previewResizeHandle = document.getElementById('previewResizeHandle');
const previewFileName = document.getElementById('previewFileName');
const previewFileMetaTop = document.getElementById('previewFileMetaTop');
const previewOpenAppBtn = document.getElementById('previewOpenAppBtn');
const previewRevealFinderBtn = document.getElementById('previewRevealFinderBtn');
const previewBody = document.getElementById('previewBody');
const previewExternalBtn = document.getElementById('previewExternalBtn');
const previewCloseBtn = document.getElementById('previewCloseBtn');
const previewDetailType = document.getElementById('previewDetailType');
const previewDetailSize = document.getElementById('previewDetailSize');
const previewDetailDate = document.getElementById('previewDetailDate');
const previewDetailLocal = document.getElementById('previewDetailLocal');
const previewDownloadBtn = document.getElementById('previewDownloadBtn');
const previewOpenAppFooterBtn = document.getElementById('previewOpenAppFooterBtn');
const previewRevealFinderFooterBtn = document.getElementById('previewRevealFinderFooterBtn');

// Grades Elements
const gradeBigPct = document.getElementById('gradeBigPct');
const gradeBigLetter = document.getElementById('gradeBigLetter');
const gradedItemsCountVal = document.getElementById('gradedItemsCountVal');
const totalPointsEarnedVal = document.getElementById('totalPointsEarnedVal');
const gradesTableBody = document.getElementById('gradesTableBody');

// Settings Elements
const backToCoursesBtn = document.getElementById('backToCoursesBtn');
const settingsForm = document.getElementById('settingsForm');
const settingsDomainInput = document.getElementById('settingsDomainInput');
const settingsTokenInput = document.getElementById('settingsTokenInput');
const toggleSettingsTokenVisibility = document.getElementById('toggleSettingsTokenVisibility');
const settingsRemember = document.getElementById('settingsRemember');
const disconnectSettingsBtn = document.getElementById('disconnectSettingsBtn');
const saveCredentialsBtn = document.getElementById('saveCredentialsBtn');
const settingsScheduleIcalInput = document.getElementById('settingsScheduleIcalInput');
const btnSaveScheduleUrl = document.getElementById('btnSaveScheduleUrl');
const btnTestSyncSchedule = document.getElementById('btnTestSyncSchedule');
const scheduleSyncStatusLabel = document.getElementById('scheduleSyncStatusLabel');
const scheduleSyncStatusText = document.getElementById('scheduleSyncStatusText');

// Profile Elements
const userAvatar = document.getElementById('userAvatar');
const avatarFallback = document.getElementById('avatarFallback');
const userName = document.getElementById('userName');
const userRoleBadge = document.getElementById('userRoleBadge');
const userHandle = document.getElementById('userHandle');
const userBio = document.getElementById('userBio');
const userEmail = document.getElementById('userEmail');
const userTimezone = document.getElementById('userTimezone');
const userLocalTime = document.getElementById('userLocalTime');
const userLocale = document.getElementById('userLocale');
const refreshProfileBtn = document.getElementById('refreshProfileBtn');
const identityProps = document.getElementById('identityProps');
const systemProps = document.getElementById('systemProps');
const icsFeedInput = document.getElementById('icsFeedInput');
const copyIcsBtn = document.getElementById('copyIcsBtn');
const openIcsBtn = document.getElementById('openIcsBtn');
const copyEmailBtn = document.getElementById('copyEmailBtn');

// Raw JSON Elements
const rawJsonBlock = document.getElementById('rawJsonBlock');
const jsonSearchInput = document.getElementById('jsonSearchInput');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');

// Modals
const docsModal = document.getElementById('docsModal');
const closeDocsModalBtn = document.getElementById('closeDocsModalBtn');
const credentialsModal = document.getElementById('credentialsModal');
const closeCredentialsModalBtn = document.getElementById('closeCredentialsModalBtn');
const credentialsModalTitle = document.getElementById('credentialsModalTitle');
const credentialsModalDesc = document.getElementById('credentialsModalDesc');
const credentialsMissingBadges = document.getElementById('credentialsMissingBadges');
const modalDomainInput = document.getElementById('modalDomainInput');
const modalTokenInput = document.getElementById('modalTokenInput');
const toggleModalTokenVisibility = document.getElementById('toggleModalTokenVisibility');
const credentialsModalEnterBtn = document.getElementById('credentialsModalEnterBtn');
const credentialsModalDemoBtn = document.getElementById('credentialsModalDemoBtn');
const credentialsModalOfflineBtn = document.getElementById('credentialsModalOfflineBtn');
const loadOfflineBtn = document.getElementById('loadOfflineBtn');
const offlineNotificationBar = document.getElementById('offlineNotificationBar');
const offlineBarReconnectBtn = document.getElementById('offlineBarReconnectBtn');
const btnToggleOfflineMode = document.getElementById('btnToggleOfflineMode');
const btnPrecacheAllCourses = document.getElementById('btnPrecacheAllCourses');
const btnClearCacheBtn = document.getElementById('btnClearCacheBtn');
const clearCacheConfirmModal = document.getElementById('clearCacheConfirmModal');
const closeClearCacheModalBtn = document.getElementById('closeClearCacheModalBtn');
const cancelClearCacheBtn = document.getElementById('cancelClearCacheBtn');
const confirmClearCacheBtn = document.getElementById('confirmClearCacheBtn');
const courseCustomizationModal = document.getElementById('courseCustomizationModal');
const closeCourseCustomizationModalBtn = document.getElementById('closeCourseCustomizationModalBtn');
const customizationModalTitle = document.getElementById('customizationModalTitle');
const customizationModalSubtitle = document.getElementById('customizationModalSubtitle');
const customizationModalHeaderIcon = document.getElementById('customizationModalHeaderIcon');
const customizationModalHeaderIconWrap = document.getElementById('customizationModalHeaderIconWrap');
const customizationPreviewBanner = document.getElementById('customizationPreviewBanner');
const customizationPreviewIcon = document.getElementById('customizationPreviewIcon');
const customizationPreviewCode = document.getElementById('customizationPreviewCode');
const customizationPreviewName = document.getElementById('customizationPreviewName');
const customizationColorPalette = document.getElementById('customizationColorPalette');
const customizationCustomColorPicker = document.getElementById('customizationCustomColorPicker');
const customizationCustomColorInput = document.getElementById('customizationCustomColorInput');
const customizationIconPalette = document.getElementById('customizationIconPalette');
const customizationIconSearchInput = document.getElementById('customizationIconSearchInput');
const customizationClearIconSearchBtn = document.getElementById('customizationClearIconSearchBtn');
const customizationCategoryPills = document.getElementById('customizationCategoryPills');
const customizationIconCount = document.getElementById('customizationIconCount');
const customizationIconEmpty = document.getElementById('customizationIconEmpty');
const customizationResetBtn = document.getElementById('customizationResetBtn');
const customizationCancelBtn = document.getElementById('customizationCancelBtn');
const customizationSaveBtn = document.getElementById('customizationSaveBtn');
const toastContainer = document.getElementById('toastContainer');
const calendarConnectScheduleModal = document.getElementById('calendarConnectScheduleModal');
const closeCalendarScheduleModalBtn = document.getElementById('closeCalendarScheduleModalBtn');
const dismissCalendarScheduleModalBtn = document.getElementById('dismissCalendarScheduleModalBtn');
const goToSettingsScheduleBtn = document.getElementById('goToSettingsScheduleBtn');

// Assignment Submission Modal Elements
const assignmentSubmitModal = document.getElementById('assignmentSubmitModal');
const closeAssignmentSubmitModalBtn = document.getElementById('closeAssignmentSubmitModalBtn');
const assignmentSubmitModalTitle = document.getElementById('assignmentSubmitModalTitle');
const assignmentSubmitAttemptBadge = document.getElementById('assignmentSubmitAttemptBadge');
const assignmentSubmitModalSubtitle = document.getElementById('assignmentSubmitModalSubtitle');
const assignmentSubmitDueText = document.getElementById('assignmentSubmitDueText');
const assignmentSubmitPtsText = document.getElementById('assignmentSubmitPtsText');
const assignmentSubmitFormatsText = document.getElementById('assignmentSubmitFormatsText');
const assignmentSubmitForm = document.getElementById('assignmentSubmitForm');
const assignmentSubmitTabs = document.getElementById('assignmentSubmitTabs');
const submitTabUploadBtn = document.getElementById('submitTabUploadBtn');
const submitTabTextBtn = document.getElementById('submitTabTextBtn');
const submitTabUrlBtn = document.getElementById('submitTabUrlBtn');
const submitPaneUpload = document.getElementById('submitPaneUpload');
const submitPaneText = document.getElementById('submitPaneText');
const submitPaneUrl = document.getElementById('submitPaneUrl');
const assignmentModalDropzone = document.getElementById('assignmentModalDropzone');
const assignmentModalFileInput = document.getElementById('assignmentModalFileInput');
const assignmentModalBrowseBtn = document.getElementById('assignmentModalBrowseBtn');
const assignmentModalAcceptedHint = document.getElementById('assignmentModalAcceptedHint');
const assignmentModalFilesList = document.getElementById('assignmentModalFilesList');
const assignmentModalTextarea = document.getElementById('assignmentModalTextarea');
const assignmentModalTextStats = document.getElementById('assignmentModalTextStats');
const assignmentModalUrlInput = document.getElementById('assignmentModalUrlInput');
const assignmentModalCommentInput = document.getElementById('assignmentModalCommentInput');
const assignmentModalAlert = document.getElementById('assignmentModalAlert');
const assignmentModalCancelBtn = document.getElementById('assignmentModalCancelBtn');
const assignmentModalSubmitBtn = document.getElementById('assignmentModalSubmitBtn');
const assignmentModalSubmitBtnText = document.getElementById('assignmentModalSubmitBtnText');
const assignmentSubmitSuccessView = document.getElementById('assignmentSubmitSuccessView');
const assignmentSubmitSuccessDesc = document.getElementById('assignmentSubmitSuccessDesc');
const assignmentSubmitSuccessDetails = document.getElementById('assignmentSubmitSuccessDetails');
const assignmentSubmitSuccessCloseBtn = document.getElementById('assignmentSubmitSuccessCloseBtn');

// Course Archiving & Announcements Read Button Elements
const courseArchiveModal = document.getElementById('courseArchiveModal');
const closeCourseArchiveModalBtn = document.getElementById('closeCourseArchiveModalBtn');
const closeCourseArchiveDoneBtn = document.getElementById('closeCourseArchiveDoneBtn');
const openSettingsViewFromArchiveBtn = document.getElementById('openSettingsViewFromArchiveBtn');
const courseArchiveSearchInput = document.getElementById('courseArchiveSearchInput');
const courseArchiveList = document.getElementById('courseArchiveList');
const settingsCoursesCard = document.getElementById('settingsCoursesCard');
const settingsCoursesSearchInput = document.getElementById('settingsCoursesSearchInput');
const settingsCoursesArchiveList = document.getElementById('settingsCoursesArchiveList');
const markAllAnnouncementsReadBtn = document.getElementById('markAllAnnouncementsReadBtn');

var courseArchiveFilter = 'all';
var courseArchiveSearchQuery = '';
var settingsCourseArchiveFilter = 'all';
var settingsCourseArchiveSearchQuery = '';
window.courseArchiveFilter = courseArchiveFilter;
window.courseArchiveSearchQuery = courseArchiveSearchQuery;
window.settingsCourseArchiveFilter = settingsCourseArchiveFilter;
window.settingsCourseArchiveSearchQuery = settingsCourseArchiveSearchQuery;
