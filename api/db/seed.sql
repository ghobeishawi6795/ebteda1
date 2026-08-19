INSERT OR IGNORE INTO subjects (id, name) VALUES
('math', 'ریاضی'),
('persian', 'فارسی'),
('science', 'علوم'),
('social', 'مطالعات اجتماعی'),
('gifts', 'هدیه‌های آسمان'),
('art', 'هنر'),
('quran', 'قرآن'),
('english', 'زبان انگلیسی'),
('arabic', 'عربی'),
('sport', 'ورزش');

INSERT OR IGNORE INTO users (id, first_name, last_name, role, phone)
VALUES (
    'teacher-1',
    'معلم',
    'نمونه',
    'teacher',
    '09120000000'
);
