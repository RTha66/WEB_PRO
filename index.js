const express = require("express");
const path = require("path");
const port = 3000;
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();

app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));

// เรียกใช้ Middleware จากไฟล์ auth.js
const { teacher_auth, student_auth, admin_auth, regis_auth, general_auth } = require('./middleware/auth.js');
app.use(cookieParser());

// Connect to SQLite database
let db = new sqlite3.Database('db.db', (err) => {    
  if (err) {
      return console.error(err.message);
  }
  console.log('Connected to the SQlite database.');
});

app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const kate = "wowzaeiei";

const generateAccessToken = (payload) => {
    return jwt.sign(payload, kate, { expiresIn: '7d' });
}

app.post("/login", async(req, res) => {
    try {
        const { email, password } = req.body;
        console.log("email: ", email);
        const sql = 'SELECT * FROM User WHERE email = ? AND password = ?';
        db.get(sql, [email, password], async function (err, results) {
            if (err) {
                console.error("Error processing request", err);
                return res.status(500).send({ message: "Error processing request" });
            }
            if (!results) {
                res.status(404).send('Authentication failed: user not found.');
                return;
            }
            const payload = {
                id: results.user_id,
                role: results.role
            };

            const accessToken = generateAccessToken(payload);

            jwt.sign(payload, kate, { expiresIn: '7d' }, (err, token) => {
                if (err) throw err;
                
                res.cookie('accessToken', accessToken, { httpOnly: true, secure: true });
                
                if(results.role === 'teacher') {
                    return res.redirect('/home');
                } else if (results.role === 'registration') {
                    return res.redirect('/home');
                } else if (results.role === 'student') {
                    return res.redirect('/student/home'); 
                } else if (results.role === 'admin') {
                    return res.redirect('/home');
                } else {
                    return res.redirect('/');
                }
            });

        });
    } catch (error) {
        console.error("Unexpected error", error);
        res.status(500).json({ message: "Unexpected error processing login" });
    }
});

app.post('/logout', (req, res) => {
    res.cookie('accessToken', '', { expires: new Date(0), httpOnly: true });
    res.redirect('/');
});

app.get("/", (req, res) => {
  res.render("login"); 
});


app.get("/home", general_auth, (req, res) => {
    const userData = req.user; 

    const sql = `
        SELECT u.*, 
               t.teacher_code, t.education_level 
        FROM User u
        LEFT JOIN Teacher t ON u.user_id = t.user_id
        WHERE u.user_id = ?
    `;

    db.get(sql, [userData.id], (err, row) => {
        if (err || !row) {
            console.error("ไม่พบข้อมูลผู้ใช้ หรือ DB Error");
            return res.redirect("/");
        }

        row.avatar = row.profile_image;

        res.render("home", { user: row, active: 'home' }); 
    });
});

app.get("/teacher/schedule", teacher_auth, (req, res) => {
    const userData = req.teacher;
    const sqlUser = `SELECT u.*, t.teacher_id FROM User u LEFT JOIN Teacher t ON u.user_id = t.user_id WHERE u.user_id = ?`;

    db.get(sqlUser, [userData.id], (err, user) => {
        if (err || !user) return res.status(500).send("ไม่พบข้อมูลผู้ใช้");

        db.get("SELECT * FROM Semester WHERE is_active = 1 LIMIT 1", [], (err, activeSem) => {
            if (err || !activeSem) return res.status(500).send("ไม่พบภาคเรียนที่เปิดใช้งาน (is_active=1)");

            const sqlSchedule = `
                SELECT cs.*, c.course_code, c.course_name, s.year, s.term
                FROM CourseSection cs
                JOIN Course c ON cs.course_id = c.course_id
                JOIN Semester s ON cs.semester_id = s.semester_id
                WHERE cs.teacher_id = ? AND cs.is_active = 1 AND s.semester_id = ?
                ORDER BY CASE cs.schedule_day 
                    WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 
                    WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 
                    WHEN 'Friday' THEN 5 END, cs.start_time
            `;

            db.all(sqlSchedule, [user.teacher_id, activeSem.semester_id], (err, schedules) => {
                res.render("teacherSchedule", { 
                    user: user, 
                    schedules: schedules || [], 
                    currentSemester: activeSem
                });
            });
        });
    });
});

const getActiveSemester = (callback) => {
    db.get("SELECT semester_id, term, year FROM Semester WHERE is_active = 1 LIMIT 1", [], (err, row) => {
        callback(err, row);
    });
};

app.get("/teacher/grading", teacher_auth, (req, res) => {
    const userData = req.teacher; 

    db.get("SELECT * FROM User WHERE user_id = ?", [userData.id], (err, user) => {
        if (err || !user) return res.status(500).send("ไม่พบข้อมูลผู้ใช้");
        user.avatar = user.profile_image;

        db.get("SELECT teacher_id FROM Teacher WHERE user_id = ?", [userData.id], (err, teacher) => {
            if (err || !teacher) return res.status(500).send("ไม่พบข้อมูลอาจารย์");

            getActiveSemester((err, activeSem) => {
                if (err || !activeSem) return res.status(500).send("ไม่พบข้อมูลภาคเรียนที่กำลังใช้งาน");

                const sqlCourses = `
                    SELECT cs.section_id, cs.room, c.course_code, c.course_name
                    FROM CourseSection cs
                    JOIN Course c ON cs.course_id = c.course_id
                    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND cs.semester_id = ?
                `;

                db.all(sqlCourses, [teacher.teacher_id, activeSem.semester_id], (err, courses) => {
                    res.render("teacherCourseList", { 
                        user: user, 
                        courses: courses, 
                        currentSemester: activeSem,
                        active: 'grading'
                    });
                });
            });
        });
    });
});

app.get("/teacher/grading/:section_id", teacher_auth, (req, res) => {
    const sectionId = req.params.section_id;
    const userData = req.teacher;

    const sqlStudents = `
        SELECT s.student_id, s.student_code, u.first_name, u.last_name,
               g.assignment_score, g.midterm_score, g.final_score, g.grade_letter
        FROM Student s
        JOIN User u ON s.user_id = u.user_id
        JOIN Homeroom h ON s.homeroom_id = h.homeroom_id
        JOIN CourseSection cs ON cs.section_id = ?
        JOIN Course c ON cs.course_id = c.course_id
        LEFT JOIN Grade g ON s.student_id = g.student_id AND g.section_id = cs.section_id
        WHERE (
            (c.course_type = 'CORE' AND h.grade_level = c.grade_level)
            OR 
            (c.course_type = 'TRACK' AND h.grade_level = c.grade_level AND h.track_id = c.track_id)
            OR 
            (c.course_type IN ('ELECTIVE', 'CLUB') AND s.student_id IN (
                SELECT student_id FROM Enrollment WHERE section_id = cs.section_id
            ))
        )
        ORDER BY s.student_code ASC
    `;

    const sqlCourse = `
        SELECT c.course_code, c.course_name, s.term, s.year
        FROM CourseSection cs
        JOIN Course c ON cs.course_id = c.course_id
        JOIN Semester s ON cs.semester_id = s.semester_id
        WHERE cs.section_id = ?
    `;

    db.get("SELECT * FROM User WHERE user_id = ?", [userData.id], (err, user) => {
        if (err) return res.send("❌ DB User Error: " + err.message);
        if (user) user.avatar = user.profile_image;

        db.get(sqlCourse, [sectionId], (err, course) => {
            if (err) return res.send("❌ DB Course Error: " + err.message);
            if (!course) return res.status(404).send("ไม่พบรายวิชานี้");

            db.all(sqlStudents, [sectionId], (err, students) => {
                if (err) return res.send("❌ DB Students Error: " + err.message);
                
                res.render("teacherGrading", { 
                    user: user || {}, 
                    sectionId: sectionId, 
                    course: course || {}, 
                    students: students || [],
                    active: 'grading'
                });
            });
        });
    });
});

app.post("/teacher/grading/:section_id", teacher_auth, (req, res) => {
    const userData = req.teacher;
    const sectionId = req.params.section_id;

    if (!req.body.student_id) {
        return res.redirect("/teacher/grading/" + sectionId);
    }

    let studentIds = req.body.student_id;
    let assigns = req.body.assignment_score;
    let midterms = req.body.midterm_score;
    let finals = req.body.final_score;
    let grades = req.body.grade_letter;

    if (!Array.isArray(studentIds)) {
        studentIds = [studentIds];
        assigns = [assigns];
        midterms = [midterms];
        finals = [finals];
        grades = [grades];
    }

    const totalStudents = studentIds.length;
    let completedQueries = 0;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        for (let i = 0; i < totalStudents; i++) {
            let sId = studentIds[i];
            let asn = parseFloat(assigns[i]) || 0;
            let mid = parseFloat(midterms[i]) || 0;
            let fin = parseFloat(finals[i]) || 0;
            let grd = grades[i] || 'F';

            const sqlSaveGrade = `
                INSERT INTO Grade (student_id, section_id, entered_by, assignment_score, midterm_score, final_score, grade_letter, entered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(student_id, section_id) 
                DO UPDATE SET 
                    assignment_score = excluded.assignment_score,
                    midterm_score = excluded.midterm_score,
                    final_score = excluded.final_score,
                    grade_letter = excluded.grade_letter,
                    entered_at = CURRENT_TIMESTAMP
            `;

            db.run(sqlSaveGrade, [sId, sectionId, userData.id, asn, mid, fin, grd], (err) => {
                if (err) console.error("Database Error:", err.message);
                
                completedQueries++;
                
                if (completedQueries === totalStudents) {
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) console.error("Commit Error:", commitErr.message);
                        res.redirect("/teacher/grading/" + sectionId);
                    });
                }
            });
        }
    });
});

app.get("/regis/curriculum", regis_auth, (req, res) => {
    const userData = req.registration;
    const searchQuery = req.query.search || '';
    db.get("SELECT *, profile_image AS avatar FROM User WHERE user_id = ?", [userData.id], (err, user) => {
        const sql = `
            SELECT 
                c.course_id AS subject_id, c.course_code, c.course_name AS subject_name, 
                c.credit_hours AS credits, cs.room, cs.schedule_day, cs.max_students,
                u_t.first_name || ' ' || u_t.last_name AS teacher_name
            FROM Course c
            LEFT JOIN CourseSection cs ON c.course_id = cs.course_id
            LEFT JOIN Teacher t ON cs.teacher_id = t.teacher_id
            LEFT JOIN User u_t ON t.user_id = u_t.user_id
            WHERE c.course_name LIKE ? OR c.course_code LIKE ?
            GROUP BY c.course_id`;
        
        db.all(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, subjects) => {
            res.render("subjects", { 
                user: user, subjects: subjects || [], searchQuery: searchQuery 
            });
        });
    });
});

app.post("/regis/add-subject", regis_auth, (req, res) => {
    const { course_code, subject_name, credits, course_type, room, grade_level, term_no, track_id } = req.body;
    
    // ดึงเทอมล่าสุดเพื่อมาเช็คเงื่อนไข term_no
    db.get("SELECT semester_id, term FROM Semester ORDER BY semester_id DESC LIMIT 1", (err, semester) => {
        db.get("SELECT teacher_id FROM Teacher LIMIT 1", (err, teacher) => {
            
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                
                const sqlCourse = `INSERT INTO Course (course_code, course_name, credit_hours, course_type, grade_level, term_no, track_id) 
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
                db.run(sqlCourse, [course_code, subject_name, credits, course_type, grade_level || null, term_no || null, track_id || null], function(err) {
                    if (err) { db.run("ROLLBACK"); return res.status(500).send("Error Insert Course: " + err.message); }
                    
                    const newCourseId = this.lastID;
                    
                    const sqlSection = `INSERT INTO CourseSection (course_id, teacher_id, semester_id, room, schedule_day, start_time, end_time, max_students) 
                                        VALUES (?, ?, ?, ?, 'จันทร์', '08:00', '10:00', 40)`;
                    
                    db.run(sqlSection, [newCourseId, teacher.teacher_id, semester.semester_id, room], function(err) {
                        if (err) { db.run("ROLLBACK"); return res.status(500).send("Error Insert Section: " + err.message); }
                        
                        const newSectionId = this.lastID;

                        // เช็คว่าเป็น CORE/TRACK และเทอมที่สอน (term_no) ตรงกับเทอมของ Semester (semester.term)
                        if ((course_type === 'CORE' || course_type === 'TRACK') && parseInt(term_no) === parseInt(semester.term)) {
                            
                            let studentQuery = `
                                SELECT s.student_id 
                                FROM Student s 
                                JOIN Homeroom h ON s.homeroom_id = h.homeroom_id 
                                WHERE h.grade_level = ?
                            `;
                            let queryParams = [grade_level];

                            if (course_type === 'TRACK') {
                                studentQuery += ` AND h.track_id = ?`;
                                queryParams.push(track_id);
                            }

                            db.all(studentQuery, queryParams, (err, students) => {
                                if (err) { db.run("ROLLBACK"); return res.status(500).send("Error find students: " + err.message); }

                                if (students && students.length > 0) {
                                    const placeholders = students.map(() => '(?, ?, ?, 0, 0, 0, NULL, CURRENT_TIMESTAMP)').join(', ');
                                    const insertGradeSql = `INSERT OR IGNORE INTO Grade (student_id, section_id, entered_by, assignment_score, midterm_score, final_score, grade_letter, entered_at) VALUES ${placeholders}`;
                                    
                                    let gradeParams = [];
                                    students.forEach(st => {
                                        gradeParams.push(st.student_id, newSectionId, req.registration.id);
                                    });

                                    db.run(insertGradeSql, gradeParams, (err) => {
                                        if (err) { db.run("ROLLBACK"); return res.status(500).send("Error insert grades: " + err.message); }
                                        db.run("COMMIT");
                                        res.redirect("/regis/curriculum");
                                    });
                                } else {
                                    db.run("COMMIT"); 
                                    res.redirect("/regis/curriculum");
                                }
                            });
                        } else {
                            db.run("COMMIT");
                            res.redirect("/regis/curriculum");
                        }
                    });
                });
            });
        });
    });
});

app.post("/regis/update-status/:id", regis_auth, (req, res) => {
    const { status } = req.body;
    const enrollmentId = req.params.id;
    const adminId = req.registration.id; 
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // อัปเดตสถานะในตาราง ENROLLMENT
        db.run("UPDATE ENROLLMENT SET status = ?, approved_by = ?, approved_at = ? WHERE enrollment_id = ?", 
            [status, adminId, now, enrollmentId], (err) => {
            
            if (err) { db.run("ROLLBACK"); return res.status(500).send(err.message); }
            
            // ถ้าอนุมัติสำเร็จ ให้เอาเข้าตาราง Grade
            if (status === 'approved') {
                db.get("SELECT student_id, section_id FROM ENROLLMENT WHERE enrollment_id = ?", [enrollmentId], (err, row) => {
                    if (err || !row) { db.run("ROLLBACK"); return res.status(500).send("Enrollment not found"); }

                    const insertGradeSql = `
                        INSERT INTO Grade (student_id, section_id, entered_by, assignment_score, midterm_score, final_score, grade_letter, entered_at)
                        SELECT ?, ?, ?, 0, 0, 0, NULL, CURRENT_TIMESTAMP
                        WHERE NOT EXISTS (
                            SELECT 1 FROM Grade WHERE student_id = ? AND section_id = ?
                        )
                    `;

                    db.run(insertGradeSql, [row.student_id, row.section_id, adminId, row.student_id, row.section_id], (err) => {
                        if (err) { db.run("ROLLBACK"); return res.status(500).send("Error adding to grade: " + err.message); }
                        db.run("COMMIT");
                        res.redirect("/regis/enrollment"); 
                    });
                });
            } else {
                db.run("COMMIT");
                res.redirect("/regis/enrollment");
            }
        });
    });
});

// 1. หน้าแสดงฟอร์มแก้ไข (เพิ่มการส่ง courseId ไปตรงๆ กันพลาด)
app.get("/regis/edit/:id", regis_auth, (req, res) => {
    const userData = req.registration;
    const courseId = req.params.id; // ดึง ID จาก URL
    
    db.get(`SELECT c.*, cs.room, cs.schedule_day, cs.start_time, cs.end_time, cs.max_students, cs.teacher_id 
            FROM Course c 
            LEFT JOIN CourseSection cs ON c.course_id = cs.course_id 
            WHERE c.course_id = ? LIMIT 1`, [courseId], (err, subject) => {
                
        db.get("SELECT *, profile_image AS avatar FROM User WHERE user_id = ?", [userData.id], (err, user) => {
            db.all("SELECT t.teacher_id, u.first_name, u.last_name FROM Teacher t JOIN User u ON t.user_id = u.user_id", (err, teachers) => {
                res.render("edit_subject", { 
                    user: user, 
                    subject: subject || {}, 
                    teachers: teachers || [],
                    courseId: courseId // 🌟 ส่ง ID ไปให้ EJS ตรงๆ เพื่อกันบั๊ก
                });
            });
        });
    });
});

// 2. ฟังก์ชันรับค่าไปบันทึก (อัปเดตให้เซฟ 3 ค่าใหม่ลงตาราง Course ด้วย)
app.post("/regis/update-subject/:id", regis_auth, (req, res) => {
    // 🌟 รับค่า course_type เพิ่มเข้ามา
    const { course_code, course_name, credit_hours, course_type, teacher_id, schedule_day, start_time, end_time, room, max_students, grade_level, term_no, track_id } = req.body;
    
    db.serialize(() => {
        // 🌟 อัปเดต course_type ลงในตาราง Course
        db.run("UPDATE Course SET course_code = ?, course_name = ?, credit_hours = ?, course_type = ?, grade_level = ?, term_no = ?, track_id = ? WHERE course_id = ?", 
            [course_code, course_name, credit_hours, course_type, grade_level || null, term_no || null, track_id || null, req.params.id], 
            (err) => {
                if (err) console.error("Error updating Course:", err.message);
            }
        );
        
        db.run("UPDATE CourseSection SET teacher_id = ?, schedule_day = ?, start_time = ?, end_time = ?, room = ?, max_students = ? WHERE course_id = ?", 
            [teacher_id, schedule_day, start_time, end_time, room, max_students, req.params.id], 
            (err) => {
                if (err) console.error("Error updating CourseSection:", err.message);
                
                // อัปเดตเสร็จแล้วเด้งกลับหน้าหลักของรายวิชา
                res.redirect("/regis/curriculum");
            }
        );
    });
});

app.get("/regis/enrollment", regis_auth, (req, res) => {
    const userData = req.registration;
    db.get("SELECT *, profile_image AS avatar FROM User WHERE user_id = ?", [userData.id], (err, user) => {
        const sqlRequests = `
            SELECT 
                e.enrollment_id, e.status, u_student.first_name AS student_fname, 
                u_student.last_name AS student_lname, s.student_code, 
                c.course_code, c.course_name, cs.room
            FROM ENROLLMENT e
            INNER JOIN Student s ON e.student_id = s.student_id
            INNER JOIN User u_student ON s.user_id = u_student.user_id
            INNER JOIN CourseSection cs ON e.section_id = cs.section_id
            INNER JOIN Course c ON cs.course_id = c.course_id
            ORDER BY e.enrollment_id DESC`;

        db.all(sqlRequests, [], (err, rows) => {
            if (err) return res.status(500).send("SQL Error: " + err.message);
            res.render("approve_registration", { 
                user: user, requests: rows || [] 
            });
        });
    });
});

app.post("/regis/update-subject/:id", regis_auth, (req, res) => {
    // 🌟 รับค่า course_code มาด้วย
    const { course_code, course_name, credit_hours, teacher_id, schedule_day, start_time, end_time, room, max_students, grade_level, term_no, track_id } = req.body;
    
    db.serialize(() => {
        // 🌟 เพิ่ม course_code = ? เข้าไปในคำสั่ง UPDATE
        db.run("UPDATE Course SET course_code = ?, course_name = ?, credit_hours = ?, grade_level = ?, term_no = ?, track_id = ? WHERE course_id = ?", 
            [course_code, course_name, credit_hours, grade_level || null, term_no || null, track_id || null, req.params.id], 
            (err) => {
                if (err) console.error("Error updating Course:", err.message);
            }
        );
        
        db.run("UPDATE CourseSection SET teacher_id = ?, schedule_day = ?, start_time = ?, end_time = ?, room = ?, max_students = ? WHERE course_id = ?", 
            [teacher_id, schedule_day, start_time, end_time, room, max_students, req.params.id], 
            (err) => {
                if (err) console.error("Error updating CourseSection:", err.message);
                
                res.redirect("/regis/curriculum");
            }
        );
    });
});

app.post("/regis/delete-enrollment/:id", regis_auth, (req, res) => {
    db.run("DELETE FROM ENROLLMENT WHERE enrollment_id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err.message);
        res.redirect("/regis/enrollment");
    });
});

app.post("/regis/delete/:id", regis_auth, (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM CourseSection WHERE course_id = ?", [req.params.id]);
        db.run("DELETE FROM Course WHERE course_id = ?", [req.params.id], () => {
            res.redirect("/regis/curriculum");
        });
    });
});

//Admin N'น็อต
// --- ส่วนการจัดการนักเรียน (Student Management) ---
// แสดงรายชื่อนักเรียนทั้งหมด
app.get("/admin/man/student", admin_auth, (req, res) => {
    const adminId = req.admin.id;

    db.get("SELECT * FROM User WHERE user_id = ?", [adminId], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");

        const sql = `SELECT * FROM User INNER JOIN Student ON User.user_id = Student.user_id;`;
        db.all(sql, (err, rows) => {
            if (err) console.error(err.message);
            res.render('adManStu', { 
                data: rows || [], 
                total: rows ? rows.length : 0, 
                active: 'student',
                user: adminUser
            });
        });
    });
});

app.get("/admin/man/addStu", admin_auth, (req, res) => {
    db.get("SELECT * FROM User WHERE user_id = ?", [req.admin.id], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");
        res.render("addInStu", { user: adminUser, active: 'student' });
    });
});

app.post("/admin/man/saveStu", admin_auth, (req, res) => {
    const { first, last, gender, DOB, tel, ID, email, password, room } = req.body;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const userSql = `INSERT INTO User(email, password, role, gender, first_name, last_name, birth_date, phone, profile_image, is_active, created_at) 
                         VALUES(?, ?, 'student', ?, ?, ?, ?, ?, ?, 1, ?)`;
        
        db.run(userSql, [email, password, gender, first, last, DOB, tel, ID + ".png", timestamp], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).send("Error creating user: " + err.message);
            }

            const newUserId = this.lastID;
            const studentSql = `INSERT INTO Student(user_id, homeroom_id, student_code, student_status) VALUES (?, ?, ?, 'active')`;

            db.run(studentSql, [newUserId, room, ID], (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).send("Error creating student: " + err.message);
                }
                db.run("COMMIT");
                res.redirect("/admin/man/student");
            });
        });
    });
});

app.get("/admin/man/delStu/:id", admin_auth, (req, res) => {
    const user_id = req.params.id;
    db.serialize(() => {
        db.run(`DELETE FROM Student WHERE user_id = ?`, [user_id]);
        db.run(`DELETE FROM User WHERE user_id = ?`, [user_id], (err) => {
            if (err) console.error(err.message);
            res.redirect('/admin/man/student');
        });
    });
});

app.get("/admin/man/teacher", admin_auth, (req, res) => {
    const adminId = req.admin.id;

    db.get("SELECT * FROM User WHERE user_id = ?", [adminId], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");

        const sql = `SELECT * FROM User INNER JOIN Teacher ON User.user_id = Teacher.user_id;`;
        db.all(sql, (err, rows) => {
            if (err) console.error(err.message);
            res.render('adManTea', { 
                data: rows || [], 
                total: rows ? rows.length : 0, 
                active: 'teacher',
                user: adminUser
            });
        });
    });
});

app.get("/admin/man/addTea", admin_auth, (req, res) => {
    db.get("SELECT * FROM User WHERE user_id = ?", [req.admin.id], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");
        res.render("addInTea", { user: adminUser, active: 'teacher' });
    });
});

app.post("/admin/man/saveTea", admin_auth, (req, res) => {
    const { first, last, gender, DOB, tel, ID, email, password, edLev } = req.body;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const userSql = `INSERT INTO User(email, password, role, gender, first_name, last_name, birth_date, phone, profile_image, is_active, created_at) 
                         VALUES(?, ?, 'teacher', ?, ?, ?, ?, ?, ?, 1, ?)`;

        db.run(userSql, [email, password, gender, first, last, DOB, tel, ID + ".png", timestamp], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).send("Error: " + err.message);
            }
            const newUserId = this.lastID;
            const teacherSql = `INSERT INTO Teacher(user_id, teacher_code, education_level) VALUES (?, ?, ?)`;
            
            db.run(teacherSql, [newUserId, ID, edLev], (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).send("Error: " + err.message);
                }
                db.run("COMMIT");
                res.redirect("/admin/man/teacher");
            });
        });
    });
});

app.post("/admin/man/changeTea", admin_auth, (req, res) => {
    const { first, last, tel, ID, email, edLev, status } = req.body;
    const isActive = (status === 'active' || status === '1') ? 1 : 0;

    db.serialize(() => {
        db.run(`UPDATE User SET first_name = ?, last_name = ?, phone = ?, is_active = ? WHERE email = ?`, 
                [first, last, tel, isActive, email]);
        db.run(`UPDATE Teacher SET education_level = ? WHERE teacher_code = ?`, 
                [edLev, ID], (err) => {
            res.redirect('/admin/man/teacher');
        });
    });
});

app.get("/admin/man/editStu/:id", admin_auth, (req, res) => {
    let user_id = req.params.id;
    const sql = `SELECT * FROM User JOIN Student ON User.user_id = Student.user_id WHERE Student.user_id = ?;`;

    db.get("SELECT * FROM User WHERE user_id = ?", [req.admin.id], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");

        db.get(sql, [user_id], (err, row) => {
            if (err) console.error(err.message);
            res.render("editInStu", { 
                data: row, 
                user: adminUser,
                active: 'student'
            });
        });
    });
});

app.post("/admin/man/changeStu", admin_auth, (req, res) => { 
    let { first, last, tel, ID, email, room, status } = req.body;
    let isActive = (status === 'active') ? 1 : 0;

    db.serialize(() => {
        const chUser = `UPDATE User SET first_name = ?, last_name = ?, phone = ?, is_active = ? WHERE email = ?`;
        db.run(chUser, [first, last, tel, isActive, email], (err) => { 
            if (err) return console.error('Error changing user data:', err.message);

            const chStu = `UPDATE Student SET homeroom_id = ?, student_status = ? WHERE student_code = ?`;
            db.run(chStu, [room, status, ID], (err) => { 
                if (err) return console.error('Error changing student data:', err.message);
                res.redirect('/admin/man/student');
            });
        });
    });
});

app.get("/admin/man/editTea/:id", admin_auth, (req, res) => {
    let user_id = req.params.id;
    const sql = `SELECT * FROM User JOIN Teacher ON User.user_id = Teacher.user_id WHERE Teacher.user_id = ?;`;

    db.get("SELECT * FROM User WHERE user_id = ?", [req.admin.id], (err, adminUser) => {
        if (err || !adminUser) return res.status(500).send("ไม่พบข้อมูลแอดมิน");

        db.get(sql, [user_id], (err, row) => {
            if (err) console.error(err.message);
            res.render("editInTea", { 
                data: row, 
                user: adminUser, 
                active: 'teacher' 
            });
        });
    });
});

// 1. หน้าข้อมูลส่วนตัวนักเรียน
app.get("/student/home", student_auth, (req, res) => {
    const userData = req.student;

    const sql = `
        SELECT 
            u.user_id, u.email, u.role, u.gender, u.first_name, u.last_name, 
            u.birth_date, u.phone, u.profile_image,
            s.student_code, h.room_name
        FROM User u
        LEFT JOIN Student s ON u.user_id = s.user_id
        LEFT JOIN Homeroom h ON s.homeroom_id = h.homeroom_id
        WHERE u.user_id = ?
    `;

    db.get(sql, [userData.id], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Database error");
        }
        if (!row) {
            return res.status(404).send("User not found");
        }

        row.avatar = row.profile_image;

        res.render("studentHome", { user: row, active: 'home' });
    });
});

// 2. หน้าตารางเรียน
app.get("/student/timetable", student_auth, (req, res) => {
    const userData = req.student;

    const sqlUser = `
        SELECT u.*, s.student_id, s.student_code
        FROM User u
        LEFT JOIN Student s ON u.user_id = s.user_id
        WHERE u.user_id = ?
    `;

    db.get(sqlUser, [userData.id], (err, user) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        if (!user) {
            return res.status(404).send("User not found");
        }

        const sqlSchedule = `
            WITH student_info AS (
                SELECT st.student_id, h.grade_level, h.track_id
                FROM Student st
                JOIN Homeroom h ON st.homeroom_id = h.homeroom_id
                WHERE st.student_id = ?
            )
            -- CORE (Morning)
            SELECT cs.schedule_day, cs.start_time, cs.end_time, cs.room, c.course_code, c.course_name, s.year, s.term
            FROM student_info p
            JOIN Course c ON c.grade_level = p.grade_level
            JOIN CourseSection cs ON cs.course_id = c.course_id
            JOIN Semester s ON cs.semester_id = s.semester_id
            WHERE c.course_type = 'CORE' AND cs.start_time < '12:00' AND s.is_active = 1
            UNION ALL
            -- TRACK (Afternoon)
            SELECT cs.schedule_day, cs.start_time, cs.end_time, cs.room, c.course_code, c.course_name, s.year, s.term
            FROM student_info p
            JOIN Course c ON c.grade_level = p.grade_level AND c.track_id = p.track_id
            JOIN CourseSection cs ON cs.course_id = c.course_id
            JOIN Semester s ON cs.semester_id = s.semester_id
            WHERE c.course_type = 'TRACK' AND cs.start_time >= '13:00' AND s.is_active = 1
            UNION ALL
            -- ELECTIVE + CLUB (Afternoon)
            SELECT cs.schedule_day, cs.start_time, cs.end_time, cs.room, c.course_code, c.course_name, s.year, s.term
            FROM student_info p
            JOIN Enrollment e ON e.student_id = p.student_id
            JOIN CourseSection cs ON e.section_id = cs.section_id
            JOIN Course c ON cs.course_id = c.course_id
            JOIN Semester s ON cs.semester_id = s.semester_id
            WHERE c.course_type IN ('ELECTIVE','CLUB') AND cs.start_time >= '13:00' AND e.status = 'active' AND s.is_active = 1
        `;

        db.all(sqlSchedule, [user.student_id], (err, schedules) => {
            if(err){
                console.error(err);
                return res.status(500).send("Schedule error");
            }
            
            res.render("studentSchedule", {
                user,
                schedules,
                term: schedules.length ? schedules[0].term : null,
                year: schedules.length ? schedules[0].year : null,
                active: 'timetable' // 🌟 เพิ่ม active state
            });
        });
    });
});

// 3. หน้าผลการเรียน
app.get("/student/grades", student_auth, (req, res) => {
    const year = req.query.year;
    const term = req.query.term;

    let sql = `
        SELECT c.course_code, c.course_name, c.credit_hours, g.assignment_score, g.midterm_score, g.final_score, g.grade_letter, s.year, s.term
        FROM Grade g
        JOIN CourseSection cs ON g.section_id = cs.section_id
        JOIN Course c ON cs.course_id = c.course_id
        JOIN Semester s ON cs.semester_id = s.semester_id
        JOIN Student st ON g.student_id = st.student_id
        WHERE st.user_id = ?
    `;

    let params = [req.student.id];

    if(year){
        sql += " AND s.year = ?";
        params.push(year);
    }
    if(term){
        sql += " AND s.term = ?";
        params.push(term);
    }
    sql += " ORDER BY s.year DESC, s.term DESC";

    db.all(sql, params, (err, grades) => {
        if(err){
            console.error(err);
            return res.status(500).send("Grade error");
        }

        db.all(`SELECT DISTINCT year FROM Semester ORDER BY year DESC`, (err, years)=>{
            db.get("SELECT * FROM User WHERE user_id = ?", [req.student.id], (err, user) => {
                if(err){
                    console.error(err);
                    return res.status(500).send("User error");
                }
                res.render("studentGrades",{
                    user: user,
                    grades: grades,
                    years: years.map(y=>y.year),
                    selectedYear: year,
                    selectedTerm: term,
                    active: 'grades' // 🌟 เพิ่ม active state
                });
            });
        });
    });
});

// 4. หน้าลงทะเบียนเรียนวิชาเลือก
app.get("/student/enroll", student_auth, (req,res)=>{
    const sql = `
        SELECT cs.section_id, c.course_code, c.course_name, c.course_type, c.credit_hours, cs.schedule_day, cs.start_time, cs.end_time, cs.room
        FROM CourseSection cs
        JOIN Course c ON cs.course_id = c.course_id
        JOIN Semester s ON cs.semester_id = s.semester_id
        WHERE LOWER(c.course_type) IN ('elective','club')
        AND cs.is_active = 1
        AND c.is_active = 1
        AND s.is_active = 1
    `;

    db.all(sql,(err,sections)=>{
        if(err){
            console.error(err);
            return res.status(500).send("Database error");
        }

        db.get("SELECT * FROM User WHERE user_id = ?", [req.student.id], (err, user) => {
            if(err){
                console.error(err);
                return res.status(500).send("User error");
            }
            res.render("studentEnrollment",{
                user: user,
                sections: sections,
                active: 'enroll' // 🌟 เพิ่ม active state
            });
        });
    });
});

// 5. บันทึกการลงทะเบียน
app.post("/student/enroll", student_auth, (req,res)=>{
    const sectionId = req.body.section_id;
    const userId = req.student.id;

    if(!sectionId){
        return res.redirect("/student/enroll");
    }

    const getStudentSql = `SELECT student_id FROM Student WHERE user_id = ?`;

    db.get(getStudentSql,[userId],(err,student)=>{
        if(err){
            console.error(err);
            return res.send("Student lookup error");
        }
        if(!student){
            return res.send("Student not found");
        }

        const insertSql = `
            INSERT INTO Enrollment (student_id, section_id, status, created_at)
            VALUES (?, ?, 'pending', datetime('now'))
        `;

        db.run(insertSql,[student.student_id,sectionId],(err)=>{
            if(err){
                console.error(err);
                return res.send("Enrollment error");
            }
            res.redirect("/student/enroll");
        });
    });
});

app.listen(port, () => {
  console.log(`Starting server at port ${port}`);
});