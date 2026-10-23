# הפעלת שרת התזכורות

התזכורות נשלחות מ-Supabase: כל דקה Supabase בודק אילו תזכורות הגיע זמנן ושולח אותן לטלפון.
צריך לעשות את זה פעם אחת בלבד. זה לוקח בערך עשר דקות.

## 1. טבלאות ותזמון

1. פותחים את הפרויקט ב-Supabase, ונכנסים ל-SQL Editor.
2. מדביקים את כל התוכן של הקובץ `supabase/reminders.sql` ולוחצים Run.

## 2. פונקציית השליחה

בטרמינל, בתיקייה של האפליקציה:

```sh
brew install supabase/tap/supabase
supabase login
supabase link --project-ref herzjfdrakjfwihemjrp
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy send-reminders --no-verify-jwt
```

הקובץ `supabase/functions/.env` כבר נמצא במחשב שלך ומכיל את מפתחות ההתראות (VAPID).
הוא לא נכנס ל-git ולא מתפרסם. אם הוא נמחק, צריך ליצור זוג מפתחות חדש ולעדכן גם את
`vapidPublicKey` בקובץ `cloud-config.js`.

## 3. באייפון

1. מעלים את הגרסה (`git push`) ומחכים דקה שהאתר יתעדכן.
2. פותחים את האפליקציה **מהמסך הראשי** (לא מספארי). בלי זה אייפון לא מאפשר התראות.
3. מתחברים לחשבון בהגדרות, אם עוד לא.
4. הגדרות ← התראות ← הפעלה, ומאשרים.

## בדיקה

מוסיפים משימה, לוחצים על "שעה" ← "תאריך ושעה אחרים", ובוחרים את השעה העגולה הקרובה (עוד פחות
מחמש דקות). ההתראה אמורה להגיע תוך דקה מהשעה שנבחרה.

אם לא מגיעה התראה: ב-Supabase, Edge Functions ← send-reminders ← Logs מראה כל הרצה.
