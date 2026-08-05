// seed.js — default catalog. cat = index into categories.
export const SEED = {
  categories: [
    { name: 'ירקות' }, { name: 'פירות' }, { name: 'מוצרי חלב' },
    { name: 'בשר ודגים' }, { name: 'מאפים' }, { name: 'קפואים' },
    { name: 'שימורים ויבשים' }, { name: 'ממתקים וחטיפים' },
    { name: 'משקאות' }, { name: 'ניקיון' }, { name: 'טואלטיקה' },
  ],
  items: [
    // ירקות (0)
    { name: 'מלפפונים', cat: 0 }, { name: 'עגבניות', cat: 0 },
    { name: 'בצל', cat: 0 }, { name: 'שום', cat: 0 },
    { name: 'גזר', cat: 0 }, { name: 'פלפל אדום', cat: 0 },
    { name: 'חסה', cat: 0 }, { name: 'תפוחי אדמה', cat: 0 },
    { name: 'בטטה', cat: 0 }, { name: 'קישוא', cat: 0 },
    { name: 'חציל', cat: 0 }, { name: 'ברוקולי', cat: 0 },
    { name: 'כרובית', cat: 0 }, { name: 'פטרוזיליה', cat: 0 },
    { name: 'כוסברה', cat: 0 }, { name: 'שמיר', cat: 0 },
    { name: 'לימון', cat: 0 }, { name: 'פטריות', cat: 0 },
    // פירות (1)
    { name: 'תפוחים', cat: 1 }, { name: 'בננות', cat: 1 },
    { name: 'תפוזים', cat: 1 }, { name: 'ענבים', cat: 1 },
    { name: 'אבטיח', cat: 1 }, { name: 'מלון', cat: 1 },
    { name: 'אגסים', cat: 1 }, { name: 'אפרסקים', cat: 1 },
    { name: 'תותים', cat: 1 }, { name: 'אבוקדו', cat: 1 },
    // מוצרי חלב (2)
    { name: 'חלב', cat: 2 }, { name: 'גבינה לבנה', cat: 2 },
    { name: 'גבינה צהובה', cat: 2 }, { name: 'קוטג׳', cat: 2 },
    { name: 'יוגורט', cat: 2 }, { name: 'שמנת חמוצה', cat: 2 },
    { name: 'שמנת מתוקה', cat: 2 }, { name: 'חמאה', cat: 2 },
    { name: 'ביצים', cat: 2 }, { name: 'גבינת פטה', cat: 2 },
    { name: 'מוצרלה', cat: 2 }, { name: 'לאבנה', cat: 2 },
    // בשר ודגים (3)
    { name: 'חזה עוף', cat: 3 }, { name: 'שוקיים עוף', cat: 3 },
    { name: 'בשר טחון', cat: 3 }, { name: 'סלמון', cat: 3 },
    { name: 'טונה טרייה', cat: 3 }, { name: 'נקניקיות', cat: 3 },
    { name: 'פסטרמה', cat: 3 },
    // מאפים (4)
    { name: 'לחם', cat: 4 }, { name: 'חלה', cat: 4 },
    { name: 'פיתות', cat: 4 }, { name: 'לחמניות', cat: 4 },
    { name: 'טורטיות', cat: 4 }, { name: 'קרואסונים', cat: 4 },
    // קפואים (5)
    { name: 'אפונה קפואה', cat: 5 }, { name: 'שעועית ירוקה קפואה', cat: 5 },
    { name: 'תירס קפוא', cat: 5 }, { name: 'פיצה קפואה', cat: 5 },
    { name: 'גלידה', cat: 5 }, { name: 'בורקס קפוא', cat: 5 },
    { name: 'מלאווח', cat: 5 },
    // שימורים ויבשים (6)
    { name: 'אורז', cat: 6 }, { name: 'פסטה', cat: 6 },
    { name: 'קוסקוס', cat: 6 }, { name: 'עדשים', cat: 6 },
    { name: 'חומוס גרגירים', cat: 6 }, { name: 'טונה בשימורים', cat: 6 },
    { name: 'תירס בשימורים', cat: 6 }, { name: 'רסק עגבניות', cat: 6 },
    { name: 'קמח', cat: 6 }, { name: 'סוכר', cat: 6 },
    { name: 'מלח', cat: 6 }, { name: 'שמן זית', cat: 6 },
    { name: 'שמן קנולה', cat: 6 }, { name: 'חומץ', cat: 6 },
    { name: 'טחינה גולמית', cat: 6 }, { name: 'דבש', cat: 6 },
    { name: 'קורנפלקס', cat: 6 }, { name: 'שיבולת שועל', cat: 6 },
    // ממתקים וחטיפים (7)
    { name: 'שוקולד', cat: 7 }, { name: 'במבה', cat: 7 },
    { name: 'ביסלי', cat: 7 }, { name: 'עוגיות', cat: 7 },
    { name: 'קרקרים', cat: 7 }, { name: 'חטיפי אנרגיה', cat: 7 },
    // משקאות (8)
    { name: 'מים מינרלים', cat: 8 }, { name: 'סודה', cat: 8 },
    { name: 'מיץ תפוזים', cat: 8 }, { name: 'קפה', cat: 8 },
    { name: 'תה', cat: 8 }, { name: 'בירה', cat: 8 }, { name: 'יין', cat: 8 },
    // ניקיון (9)
    { name: 'נוזל כלים', cat: 9 }, { name: 'אבקת כביסה', cat: 9 },
    { name: 'מרכך כביסה', cat: 9 }, { name: 'שקיות אשפה', cat: 9 },
    { name: 'נייר סופג', cat: 9 }, { name: 'ספוגים', cat: 9 },
    { name: 'אקונומיקה', cat: 9 },
    // טואלטיקה (10)
    { name: 'נייר טואלט', cat: 10 }, { name: 'משחת שיניים', cat: 10 },
    { name: 'שמפו', cat: 10 }, { name: 'מרכך שיער', cat: 10 },
    { name: 'סבון גוף', cat: 10 }, { name: 'דאודורנט', cat: 10 },
  ],
};
