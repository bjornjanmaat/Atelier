/* ==========================================================================
   Canvas AI Tools Engine
   Comprehensive Data Retrieval Tools for Assistant & LLM Tool Calling
   ========================================================================== */

(function (window) {
  'use strict';

  function cleanHtml(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = rawHtml;
    // Replace breaks and paragraphs with newlines
    tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    tmp.querySelectorAll('p').forEach(p => p.replaceWith(p.textContent + '\n\n'));
    tmp.querySelectorAll('li').forEach(li => li.replaceWith('• ' + li.textContent + '\n'));
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function resolveCourse(courseIdOrName) {
    const courses = (window.appState && window.appState.courses) || (window.DEMO_DATA && window.DEMO_DATA.courses) || [];
    if (!courseIdOrName || courseIdOrName === 'all') {
      return null;
    }
    const needle = String(courseIdOrName).toLowerCase().trim();
    // 1. Exact ID
    const byId = courses.find(c => String(c.id) === needle);
    if (byId) return byId;

    // 2. Exact or partial Code / Name
    const byCodeOrName = courses.find(c => {
      const code = (c.course_code || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      return code.includes(needle) || name.includes(needle);
    });
    return byCodeOrName || null;
  }

  async function getCourseDetails(courseId) {
    if (!courseId) return null;
    const cid = String(courseId);

    // 1. Check in-memory cache
    if (window.appState?.courseDetailsCache && window.appState.courseDetailsCache[cid]) {
      return window.appState.courseDetailsCache[cid];
    }

    // 2. Check activeCourse if matches
    if (window.appState?.activeCourse && String(window.appState.activeCourse.id) === cid && window.appState.courseDetails) {
      return window.appState.courseDetails;
    }

    // 3. Fallback to mock account / demo details
    if (window.appState?.isDemo) {
      if (typeof window.getMockAccountData === 'function') {
        const mock = window.getMockAccountData();
        if (mock?.courseDetails?.[cid]) return mock.courseDetails[cid];
      }
      if (typeof window.DEMO_COURSE_DETAILS !== 'undefined' && cid.startsWith('4820')) {
        return window.DEMO_COURSE_DETAILS;
      }
    }

    // 4. Fetch via IPC
    if (window.canvasDesktop?.getCourseDetails) {
      try {
        const res = await window.canvasDesktop.getCourseDetails({
          domain: window.appState?.currentDomain,
          token: window.appState?.currentToken,
          courseId: cid,
          preferCache: true
        });
        if (res && res.course) {
          if (window.appState?.courseDetailsCache) {
            window.appState.courseDetailsCache[cid] = res.course;
          }
          return res.course;
        }
      } catch (e) {
        console.warn('Tool getCourseDetails IPC fetch error:', e);
      }
    }

    return null;
  }

  function getAllKnownCourses() {
    if (window.appState && window.appState.courses && window.appState.courses.length > 0) {
      return window.appState.courses;
    }
    return (window.appState?.isDemo && window.DEMO_DATA && window.DEMO_DATA.courses) || [];
  }

  // --------------------------------------------------------------------------
  // Tool Definitions
  // --------------------------------------------------------------------------

  const CANVAS_AI_TOOLS = {
    // 1. Enrolled Courses
    get_enrolled_courses: {
      name: 'get_enrolled_courses',
      description: 'Returns all enrolled courses for the student, including course IDs, course titles, course codes, academic terms, instructors, and current computed grade / score percentage.',
      parameters: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Filter only currently active / available courses (default: true)' }
        }
      },
      execute: async () => {
        const courses = getAllKnownCourses();
        const results = courses.map(c => {
          const enrollment = (c.enrollments && c.enrollments[0]) || {};
          const teachers = (c.teachers || []).map(t => t.display_name).join(', ');
          return {
            id: c.id,
            name: c.name,
            course_code: c.course_code || '',
            term: c.term?.name || 'Current Term',
            teachers: teachers || 'Faculty',
            current_score: enrollment.computed_current_score != null ? `${enrollment.computed_current_score}%` : 'In Progress',
            current_grade: enrollment.computed_current_grade || 'Not available'
          };
        });
        return {
          total_courses: results.length,
          courses: results
        };
      }
    },

    // 2. Course Summary & Syllabus
    get_course_summary: {
      name: 'get_course_summary',
      description: 'Returns a comprehensive overview of a specific course: instructors, syllabus text, total assignments count, learning modules count, announcements count, and files catalog count.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Canvas course ID or course name/code (e.g. 48201 or "CS 301")' }
        },
        required: ['course_id']
      },
      execute: async (args) => {
        const course = resolveCourse(args?.course_id);
        if (!course) {
          return { error: `Course "${args?.course_id}" not found. Call get_enrolled_courses to list available courses.` };
        }
        const details = await getCourseDetails(course.id) || {};
        const teachers = (course.teachers || []).map(t => t.display_name).join(', ');
        const cleanSyllabus = cleanHtml(details.syllabus_body || course.syllabus_body || '');

        return {
          id: course.id,
          name: course.name,
          course_code: course.course_code,
          term: course.term?.name,
          teachers: teachers || 'Instructors',
          syllabus_summary: cleanSyllabus ? cleanSyllabus.slice(0, 1000) : 'No explicit syllabus text uploaded.',
          stats: {
            announcements_count: (details.announcements || []).length,
            modules_count: (details.modules || []).length,
            assignments_count: (details.assignments || []).length,
            files_count: (details.files || []).length
          }
        };
      }
    },

    // 3. List Assignments
    list_assignments: {
      name: 'list_assignments',
      description: 'Retrieves assignments for a specific course or across all courses. Supports filtering by "all", "upcoming", "past_due", "submitted", or "undated".',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional; if omitted or "all", checks all courses)' },
          filter: { type: 'string', enum: ['all', 'upcoming', 'past_due', 'submitted', 'undated'], description: 'Filter assignment criteria (default: "all")' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const filter = args?.filter || 'all';
        const now = new Date();
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const collected = [];

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const assignments = details.assignments || [];

          for (const a of assignments) {
            const dueDate = a.due_at ? new Date(a.due_at) : null;
            let status = 'undated';
            if (dueDate) {
              status = dueDate >= now ? 'upcoming' : 'past_due';
            }
            if (a.has_submitted_submissions) {
              status = 'submitted';
            }

            if (filter !== 'all') {
              if (filter === 'upcoming' && status !== 'upcoming') continue;
              if (filter === 'past_due' && status !== 'past_due') continue;
              if (filter === 'submitted' && !a.has_submitted_submissions) continue;
              if (filter === 'undated' && dueDate !== null) continue;
            }

            collected.push({
              id: a.id,
              name: a.name,
              course_id: c.id,
              course_name: c.name,
              course_code: c.course_code,
              due_at: a.due_at || 'No due date',
              points_possible: a.points_possible != null ? a.points_possible : 'N/A',
              submission_types: a.submission_types || ['online_upload'],
              has_submitted: Boolean(a.has_submitted_submissions),
              status: status
            });
          }
        }

        // Sort upcoming soonest first
        collected.sort((a, b) => {
          if (a.due_at === 'No due date') return 1;
          if (b.due_at === 'No due date') return -1;
          return new Date(a.due_at) - new Date(b.due_at);
        });

        return {
          total: collected.length,
          filter: filter,
          assignments: collected
        };
      }
    },

    // 4. Assignment Details
    get_assignment_details: {
      name: 'get_assignment_details',
      description: 'Returns the full description, prompt, rubric criteria, submission types, and deadline for a specific assignment.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional)' },
          assignment_id: { type: 'string', description: 'Exact assignment ID' },
          assignment_name: { type: 'string', description: 'Name or partial name of the assignment (e.g. "Lab 1", "Project 2", "Midterm")' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const searchName = (args?.assignment_name || '').toLowerCase().trim();
        const searchId = args?.assignment_id ? String(args.assignment_id).trim() : null;

        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const assignments = details.assignments || [];

          for (const a of assignments) {
            const matchId = searchId && String(a.id) === searchId;
            const matchName = searchName && a.name.toLowerCase().includes(searchName);

            if (matchId || matchName) {
              const cleanDesc = cleanHtml(a.description || '');
              const rubric = (a.rubric || []).map(r => ({
                criterion: r.description,
                points: r.points,
                long_description: r.long_description || ''
              }));

              return {
                id: a.id,
                name: a.name,
                course_id: c.id,
                course_name: c.name,
                due_at: a.due_at || 'No due date',
                points_possible: a.points_possible,
                allowed_attempts: a.allowed_attempts || 'Unlimited',
                submission_types: a.submission_types || ['online_upload'],
                has_submitted: Boolean(a.has_submitted_submissions),
                description: cleanDesc || 'No written description provided.',
                rubric: rubric.length > 0 ? rubric : 'No rubric attached.'
              };
            }
          }
        }

        return { error: `Assignment "${args?.assignment_name || args?.assignment_id}" not found.` };
      }
    },

    // 5. List Announcements
    list_announcements: {
      name: 'list_announcements',
      description: 'Retrieves recent course announcements, notifications, and updates from instructors.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional; if omitted or "all", checks all courses)' },
          limit: { type: 'number', description: 'Maximum announcements to return (default: 8)' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const limit = args?.limit || 8;
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const collected = [];

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const announcements = details.announcements || [];

          for (const ann of announcements) {
            collected.push({
              id: ann.id,
              title: ann.title,
              course_id: c.id,
              course_name: c.name,
              course_code: c.course_code,
              posted_at: ann.posted_at || 'Recent',
              author: ann.user_name || 'Instructor',
              unread: typeof isAnnouncementUnread === 'function' ? isAnnouncementUnread(ann) : ann.read_state === 'unread',
              excerpt: cleanHtml(ann.message || '').slice(0, 250) + '...'
            });
          }
        }

        // Sort newest first
        collected.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));

        return {
          total: collected.length,
          announcements: collected.slice(0, limit)
        };
      }
    },

    // 6. Announcement Details
    get_announcement_details: {
      name: 'get_announcement_details',
      description: 'Retrieves the complete message body and details of a specific course announcement.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID (optional)' },
          announcement_id: { type: 'string', description: 'Announcement ID' },
          title: { type: 'string', description: 'Title or keywords of the announcement' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const searchTitle = (args?.title || '').toLowerCase().trim();
        const searchId = args?.announcement_id ? String(args.announcement_id).trim() : null;
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const announcements = details.announcements || [];

          for (const ann of announcements) {
            const matchId = searchId && String(ann.id) === searchId;
            const matchTitle = searchTitle && ann.title.toLowerCase().includes(searchTitle);

            if (matchId || matchTitle) {
              return {
                id: ann.id,
                title: ann.title,
                course_id: c.id,
                course_name: c.name,
                posted_at: ann.posted_at,
                author: ann.user_name || 'Instructor',
                message: cleanHtml(ann.message || '')
              };
            }
          }
        }
        return { error: `Announcement "${args?.title || args?.announcement_id}" not found.` };
      }
    },

    // 7. List Modules
    list_modules: {
      name: 'list_modules',
      description: 'Retrieves the full curriculum module structure for a course: all module titles, completion status, and contained items (lectures, readings, labs, discussions).',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (required)' }
        },
        required: ['course_id']
      },
      execute: async (args) => {
        const course = resolveCourse(args?.course_id);
        if (!course) return { error: `Course "${args?.course_id}" not found.` };
        const details = await getCourseDetails(course.id) || {};
        const modules = details.modules || [];

        const structured = modules.map((m, idx) => ({
          module_index: idx + 1,
          id: m.id,
          name: m.name,
          state: m.state || 'unlocked',
          item_count: (m.items || []).length,
          items: (m.items || []).map(it => ({
            id: it.id,
            title: it.title,
            type: it.type || 'Page',
            completed: Boolean(it.requirement?.completed)
          }))
        }));

        return {
          course_id: course.id,
          course_name: course.name,
          total_modules: structured.length,
          modules: structured
        };
      }
    },

    // 8. Module Item Content
    get_module_item_content: {
      name: 'get_module_item_content',
      description: 'Retrieves the complete content, lecture notes, lesson text, or instructions of a specific module item.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name' },
          item_id: { type: 'string', description: 'Module item ID' },
          item_title: { type: 'string', description: 'Title or keywords of the module lesson or page (e.g. "Lecture 1", "Network Fallacies")' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const searchTitle = (args?.item_title || '').toLowerCase().trim();
        const searchId = args?.item_id ? String(args.item_id).trim() : null;
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const modules = details.modules || [];

          for (const mod of modules) {
            for (const it of (mod.items || [])) {
              const matchId = searchId && String(it.id) === searchId;
              const matchTitle = searchTitle && it.title.toLowerCase().includes(searchTitle);

              if (matchId || matchTitle) {
                return {
                  id: it.id,
                  title: it.title,
                  type: it.type,
                  module_name: mod.name,
                  course_name: c.name,
                  content: cleanHtml(it.body || '') || it.description || 'No direct text body. Link: ' + (it.external_url || it.url || 'Internal module item')
                };
              }
            }
          }
        }
        return { error: `Module item "${args?.item_title || args?.item_id}" not found.` };
      }
    },

    // 9. List Course Files
    list_course_files: {
      name: 'list_course_files',
      description: 'Retrieves all course documents, handouts, PDF papers, slides, and code assets.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional)' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const filesList = [];

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const files = details.files || [];

          for (const f of files) {
            filesList.push({
              id: f.id,
              filename: f.filename || f.display_name,
              display_name: f.display_name || f.filename,
              size: f.size ? `${(f.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown',
              updated_at: f.updated_at || 'Recent',
              preview_type: f.preview_type || 'document',
              is_local: Boolean(f.isLocal),
              course_id: c.id,
              course_name: c.name
            });
          }
        }

        return {
          total_files: filesList.length,
          files: filesList
        };
      }
    },

    // 10. Read Course File Content
    read_course_file: {
      name: 'read_course_file',
      description: 'Reads and extracts text from a course document or PDF (e.g. syllabus PDF, Lamport Clocks paper, lab guidelines).',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional)' },
          filename: { type: 'string', description: 'Filename or search string (e.g. "Syllabus", "Lamport", "Distributed")' },
          file_id: { type: 'string', description: 'Exact file ID' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const searchName = (args?.filename || '').toLowerCase().trim();
        const searchId = args?.file_id ? String(args.file_id).trim() : null;
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};
          const files = details.files || [];

          for (const f of files) {
            const fname = (f.filename || f.display_name || '').toLowerCase();
            const matchId = searchId && String(f.id) === searchId;
            const matchName = searchName && fname.includes(searchName);

            if (matchId || matchName) {
              // 1. Check if structured document_content exists (e.g. in demo)
              if (f.document_content) {
                const doc = f.document_content;
                let textOut = `# ${doc.title || f.display_name}\n`;
                if (doc.subtitle) textOut += `*${doc.subtitle}*\n\n`;
                if (Array.isArray(doc.sections)) {
                  doc.sections.forEach(s => {
                    textOut += `### ${s.heading}\n`;
                    if (s.body) textOut += `${s.body}\n\n`;
                    if (s.callout) textOut += `> **Important Note:** ${s.callout}\n\n`;
                    if (Array.isArray(s.table)) {
                      textOut += s.table.map(row => `- ${row.item || row.rule || Object.keys(row)[0]}: ${row.weight || row.desc || Object.values(row)[0]}`).join('\n') + '\n\n';
                    }
                  });
                }
                return {
                  filename: f.filename || f.display_name,
                  course_name: c.name,
                  content: textOut.trim()
                };
              }

              // 2. Read via IPC readFileText
              if (window.canvasDesktop?.readFileText) {
                try {
                  const res = await window.canvasDesktop.readFileText({
                    courseId: c.id,
                    filename: f.filename || f.display_name
                  });
                  if (res && res.success && res.text) {
                    return {
                      filename: f.filename,
                      course_name: c.name,
                      content: res.text
                    };
                  }
                } catch (e) {
                  console.warn('IPC readFileText error:', e);
                }
              }

              return {
                filename: f.filename || f.display_name,
                course_name: c.name,
                description: f.description || 'Uploaded course document',
                notice: 'File metadata retrieved. To read the full raw binary document, open it in Course Files.'
              };
            }
          }
        }
        return { error: `File "${args?.filename || args?.file_id}" not found.` };
      }
    },

    // 11. Student Grades
    get_student_grades: {
      name: 'get_student_grades',
      description: 'Retrieves current student grades, calculated score percentages, letter grades, and graded assignments breakdown.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name (optional; if omitted or "all", checks all courses)' }
        }
      },
      execute: async (args) => {
        const targetCourse = resolveCourse(args?.course_id);
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const gradesReport = [];

        for (const c of targetCourses) {
          const enrollment = (c.enrollments && c.enrollments[0]) || {};
          const details = await getCourseDetails(c.id) || {};
          const assignments = details.assignments || [];

          // Summarize individual assignments scores
          const gradedItems = assignments
            .filter(a => a.submission?.score !== null && a.submission?.score !== undefined)
            .map(a => ({
              name: a.name,
              score: a.submission.score,
              points_possible: a.points_possible
            }));

          gradesReport.push({
            course_id: c.id,
            course_name: c.name,
            course_code: c.course_code,
            computed_current_score: enrollment.computed_current_score != null ? `${enrollment.computed_current_score}%` : 'Not available',
            computed_current_grade: enrollment.computed_current_grade || 'Not available',
            assignments_count: assignments.length,
            graded_items: gradedItems.slice(0, 10)
          });
        }

        return {
          total_courses_evaluated: gradesReport.length,
          grades: gradesReport
        };
      }
    },

    // 12. Student Schedule
    get_student_schedule: {
      name: 'get_student_schedule',
      description: 'Retrieves scheduled calendar events, classes, lectures, exams, and deliverables from the student calendar / iCal feed.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Filter events on or after date (YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'Filter events on or before date (YYYY-MM-DD)' }
        }
      },
      execute: async (args) => {
        const events = (window.appState && window.appState.scheduleEvents) || [];
        const start = args?.start_date ? new Date(args.start_date) : null;
        const end = args?.end_date ? new Date(args.end_date) : null;

        const filtered = events.filter(e => {
          const evDate = new Date(e.start || e.dtstart);
          if (start && evDate < start) return false;
          if (end && evDate > end) return false;
          return true;
        });

        // Map cleanly
        const mapped = filtered.map(e => ({
          title: e.summary || e.title,
          start: e.start ? new Date(e.start).toLocaleString() : 'TBD',
          end: e.end ? new Date(e.end).toLocaleString() : '',
          location: e.location || 'Campus',
          description: e.description || ''
        }));

        return {
          total_events: mapped.length,
          events: mapped.slice(0, 20)
        };
      }
    },

    // 13. Upcoming Deadlines
    get_upcoming_deadlines: {
      name: 'get_upcoming_deadlines',
      description: 'Returns all upcoming assignments, quizzes, and project milestones due in the next N days across all enrolled courses (sorted chronologically).',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: { type: 'number', description: 'Number of days to look ahead (default: 14 days)' },
          course_id: { type: 'string', description: 'Course ID or name (optional; if omitted, checks all courses)' }
        }
      },
      execute: async (args) => {
        const days = args?.days_ahead || 14;
        const now = new Date();
        const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const targetCourse = resolveCourse(args?.course_id);
        const courses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const upcoming = [];

        for (const c of courses) {
          const details = await getCourseDetails(c.id) || {};
          const assignments = details.assignments || [];

          for (const a of assignments) {
            if (!a.due_at) continue;
            const dueDate = new Date(a.due_at);
            if (dueDate >= now && dueDate <= cutoff) {
              const diffMs = dueDate.getTime() - now.getTime();
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              upcoming.push({
                assignment_id: a.id,
                assignment_name: a.name,
                course_id: c.id,
                course_name: c.name,
                course_code: c.course_code,
                due_at: a.due_at,
                days_remaining: diffDays,
                points: a.points_possible,
                has_submitted: Boolean(a.submission?.submitted_at || ['submitted', 'graded'].includes(a.submission?.workflow_state))
              });
            }
          }
        }

        upcoming.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

        return {
          days_evaluated: days,
          upcoming_count: upcoming.length,
          deadlines: upcoming
        };
      }
    },

    // 14. Course Syllabus
    get_course_syllabus: {
      name: 'get_course_syllabus',
      description: 'Retrieves the complete syllabus, grading breakdown, office hours, and academic integrity policies for a course.',
      parameters: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID or name' }
        },
        required: ['course_id']
      },
      execute: async (args) => {
        const course = resolveCourse(args?.course_id);
        if (!course) return { error: `Course "${args?.course_id}" not found.` };
        const details = await getCourseDetails(course.id) || {};

        let syllabusText = cleanHtml(details.syllabus_body || course.syllabus_body || '');

        // If no HTML syllabus, check for syllabus PDF in files
        if (!syllabusText && Array.isArray(details.files)) {
          const sylFile = details.files.find(f => (f.filename || '').toLowerCase().includes('syllabus'));
          if (sylFile && sylFile.document_content) {
            const doc = sylFile.document_content;
            syllabusText = `# ${doc.title}\n${doc.subtitle || ''}\n\n`;
            if (Array.isArray(doc.sections)) {
              doc.sections.forEach(s => {
                syllabusText += `### ${s.heading}\n${s.body || ''}\n\n`;
                if (Array.isArray(s.table)) {
                  syllabusText += s.table.map(r => `- ${r.item}: ${r.weight}`).join('\n') + '\n\n';
                }
              });
            }
          }
        }

        return {
          course_id: course.id,
          course_name: course.name,
          course_code: course.course_code,
          syllabus: syllabusText || 'No detailed syllabus text posted for this course.'
        };
      }
    },

    // 15. Search Course Content
    search_course_content: {
      name: 'search_course_content',
      description: 'Performs full-text keyword search across all courses, modules, assignments, announcements, pages, and uploaded files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or question keywords (e.g. "Lamport", "consensus", "late days", "office hours")' },
          course_id: { type: 'string', description: 'Course ID to filter by (optional)' },
          type: { type: 'string', enum: ['all', 'assignments', 'announcements', 'modules', 'files'], description: 'Content type filter' }
        },
        required: ['query']
      },
      execute: async (args) => {
        const q = (args?.query || '').toLowerCase().trim();
        if (!q) return { error: 'Search query is required.' };
        const targetCourse = resolveCourse(args?.course_id);
        const typeFilter = args?.type || 'all';
        const targetCourses = targetCourse ? [targetCourse] : getAllKnownCourses();
        const matches = [];

        for (const c of targetCourses) {
          const details = await getCourseDetails(c.id) || {};

          // Search Announcements
          if (typeFilter === 'all' || typeFilter === 'announcements') {
            (details.announcements || []).forEach(ann => {
              const full = `${ann.title} ${ann.message || ''}`.toLowerCase();
              if (full.includes(q)) {
                matches.push({
                  type: 'Announcement',
                  title: ann.title,
                  course_name: c.name,
                  posted_at: ann.posted_at,
                  snippet: cleanHtml(ann.message || '').slice(0, 200) + '...'
                });
              }
            });
          }

          // Search Assignments
          if (typeFilter === 'all' || typeFilter === 'assignments') {
            (details.assignments || []).forEach(a => {
              const full = `${a.name} ${a.description || ''}`.toLowerCase();
              if (full.includes(q)) {
                matches.push({
                  type: 'Assignment',
                  title: a.name,
                  course_name: c.name,
                  due_at: a.due_at,
                  snippet: cleanHtml(a.description || '').slice(0, 200) + '...'
                });
              }
            });
          }

          // Search Modules
          if (typeFilter === 'all' || typeFilter === 'modules') {
            (details.modules || []).forEach(mod => {
              (mod.items || []).forEach(it => {
                const full = `${mod.name} ${it.title} ${it.body || ''}`.toLowerCase();
                if (full.includes(q)) {
                  matches.push({
                    type: 'Module Item',
                    title: `${mod.name} > ${it.title}`,
                    course_name: c.name,
                    snippet: cleanHtml(it.body || '').slice(0, 200) + '...'
                  });
                }
              });
            });
          }

          // Search Files
          if (typeFilter === 'all' || typeFilter === 'files') {
            (details.files || []).forEach(f => {
              const full = `${f.filename || ''} ${f.display_name || ''} ${f.description || ''}`.toLowerCase();
              if (full.includes(q)) {
                matches.push({
                  type: 'File',
                  title: f.display_name || f.filename,
                  course_name: c.name,
                  snippet: f.description || `Uploaded file (${f.filename})`
                });
              }
            });
          }
        }

        return {
          query: q,
          total_matches: matches.length,
          results: matches.slice(0, 15)
        };
      }
    },

    // 16. Student Profile
    get_student_profile: {
      name: 'get_student_profile',
      description: 'Retrieves current student user profile, name, email, scholar bio, and academic institution details.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        const profile = window.appState?.profileData || (window.DEMO_DATA && window.DEMO_DATA.profile) || {};
        return {
          name: profile.name || 'Alex Rivera',
          short_name: profile.short_name || 'Alex',
          email: profile.primary_email || 'alex.rivera@university.edu',
          bio: profile.bio || 'Computer Science & Design Scholar',
          title: profile.title || 'Student Scholar',
          time_zone: profile.time_zone || 'America/New_York',
          login_id: profile.login_id || 'arivera_2026'
        };
      }
    }
  };

  // --------------------------------------------------------------------------
  // Tool Execution Engine
  // --------------------------------------------------------------------------

  async function executeAiTool(toolName, parameters = {}) {
    const tool = CANVAS_AI_TOOLS[toolName];
    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" is not registered. Available tools: ${Object.keys(CANVAS_AI_TOOLS).join(', ')}`
      };
    }

    try {
      const data = await tool.execute(parameters);
      return {
        success: true,
        tool: toolName,
        parameters: parameters,
        data: data
      };
    } catch (err) {
      console.error(`Error executing AI tool "${toolName}":`, err);
      return {
        success: false,
        tool: toolName,
        error: err.message || 'Execution error'
      };
    }
  }

  // Finds the next {"tool": ...} object. end is -1 while the object is still streaming in.
  function findToolCallSpan(text, from = 0) {
    const pattern = /\{\s*"(tool|name)"\s*:\s*"([a-zA-Z0-9_-]*)/g;
    pattern.lastIndex = from;
    let match;
    while ((match = pattern.exec(text))) {
      // {"name": "..."} is only a tool call for a known tool; it could also be ordinary example JSON
      if (match[1] === 'name' && !CANVAS_AI_TOOLS[match[2]]) continue;

      let depth = 0;
      let inString = false;
      for (let i = match.index; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (ch === '\\') i++;
          else if (ch === '"') inString = false;
        } else if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}' && --depth === 0) {
          return { start: match.index, end: i + 1 };
        }
      }
      return { start: match.index, end: -1 };
    }
    return null;
  }

  function parseAiToolCall(text) {
    if (!text || typeof text !== 'string') return null;

    const span = findToolCallSpan(text);
    if (!span || span.end === -1) return null;

    try {
      const parsed = JSON.parse(text.slice(span.start, span.end));
      const tool = parsed.tool || parsed.name;
      if (!CANVAS_AI_TOOLS[tool]) return null;
      return { tool, parameters: parsed.parameters || parsed.args || {} };
    } catch {
      return null;
    }
  }

  function stripAiToolCalls(text) {
    if (!text || typeof text !== 'string') return '';

    let visible = '';
    let cursor = 0;
    let span;
    while ((span = findToolCallSpan(text, cursor))) {
      visible += text.slice(cursor, span.start);
      if (span.end === -1) {
        cursor = text.length;
        break;
      }
      cursor = span.end;
    }
    visible += text.slice(cursor);

    visible = visible
      .replace(/<\/?tool_call>/gi, '')
      .replace(/```[\w:-]*\s*```/g, '')
      .replace(/```(?:tool|json:tool)[\w:-]*\s*$/i, '');

    // A fence left open by the removed call, not the closing fence of a real code block
    const fenceCount = (visible.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) {
      visible = visible.replace(/```(?:json)?\s*$/i, '');
    }

    return visible.trim();
  }

  // Expose globally
  window.canvasAiTools = {
    tools: CANVAS_AI_TOOLS,
    executeTool: executeAiTool,
    parseToolCall: parseAiToolCall,
    stripToolCalls: stripAiToolCalls
  };

})(window);
