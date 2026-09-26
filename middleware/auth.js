const jwt = require('jsonwebtoken');
const kate = "wowzaeiei";

// ฟังก์ชันสำหรับตรวจสอบทั้ง "การล็อกอิน" และ "Role" ว่าตรงกันไหม
const verifyTokenAndRole = (allowedRole, reqKey) => {
    return (req, res, next) => {
        const token = req.cookies.accessToken;
        
        if (!token) {
            return res.redirect('/');
        }

        jwt.verify(token, kate, (err, decoded) => {

            if (err) {
                return res.redirect('/');
            }

            if (decoded.role !== allowedRole) {
                if (decoded.role === 'student') return res.redirect('/student/home');
                if (decoded.role === 'teacher') return res.redirect('/home');
                if (decoded.role === 'admin') return res.redirect('/home');
                if (decoded.role === 'registration') return res.redirect('/home');
                return res.redirect('/'); 
            }

            req[reqKey] = decoded;
            next();
        });
    };
};

module.exports = {
    teacher_auth: verifyTokenAndRole('teacher', 'teacher'),
    student_auth: verifyTokenAndRole('student', 'student'),
    admin_auth: verifyTokenAndRole('admin', 'admin'),
    regis_auth: verifyTokenAndRole('registration', 'registration'),
    
    // general_auth ใช้สำหรับหน้า /home (แอดมิน ทะเบียน อาจารย์ เข้าได้ แต่นักเรียนเข้าไม่ได้)
    general_auth: (req, res, next) => {
        const token = req.cookies.accessToken;
        if (!token) return res.redirect('/');
        
        jwt.verify(token, kate, (err, decoded) => {
            if (err) return res.redirect('/');
            
            if (decoded.role === 'student') {
                return res.redirect('/student/home'); 
            }
            
            req.user = decoded;
            next();
        });
    }
};