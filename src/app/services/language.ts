import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppLanguage = 'en' | 'he';

const languageStorageKey = 'northBarberLanguage';

const hebrew: Record<string, string> = {
  'Book Appointment': 'קביעת תור',
  'Book Same Again': 'קביעת אותו תור שוב',
  'Booking complete': 'התור נקבע',
  'Your appointment has been confirmed:': 'התור שלך אושר:',
  'Book your next haircut in minutes.': 'קבעו את התספורת הבאה שלכם בתוך דקות.',
  'Next available:': 'התור הקרוב:',
  'No account needed. SMS confirmation. Pay in shop.': 'אין צורך בחשבון. אישור ב־SMS. התשלום במספרה.',
  'Services': 'שירותים',
  'Choose your service': 'בחירת שירות',
  'View all services': 'לכל השירותים',
  'Our barbers': 'הספרים שלנו',
  'Meet the team': 'הכירו את הצוות',
  'Downtown · Open daily 09:30–19:00': 'מרכז העיר · פתוח מדי יום 09:30–19:00',
  'Pay in shop': 'תשלום במספרה',
  'Language selection': 'בחירת שפה',
  'North Barber home': 'דף הבית של NORTH BARBER',
  'Booking progress': 'התקדמות ההזמנה',
  'Choose': 'בחירה',
  'Your details': 'הפרטים שלך',
  'Confirm': 'אישור',
  'Step 1 of 3': 'שלב 1 מתוך 3',
  'Step 2 of 3': 'שלב 2 מתוך 3',
  'Step 3 of 3': 'שלב 3 מתוך 3',
  'Choose a service': 'בחירת שירות',
  'We’ll find the soonest available barber.': 'נמצא את הספר הפנוי הקרוב ביותר.',
  'Pick a day and time': 'בחירת יום ושעה',
  'Change service': 'החלפת שירות',
  'Current booking selection': 'בחירת התור הנוכחית',
  'Best available barber': 'הספר הפנוי ביותר',
  'Choose a barber': 'בחירת ספר',
  'Quick time choices': 'בחירת שעה מהירה',
  'Earliest': 'הקרוב ביותר',
  'Today': 'היום',
  'Tomorrow': 'מחר',
  'After work': 'אחרי העבודה',
  'Choose appointment date': 'בחירת תאריך לתור',
  'Closed': 'סגור',
  'Full': 'מלא',
  'No available days. Please call the shop.': 'אין ימים פנויים. נא להתקשר למספרה.',
  'Loading available times…': 'טוען שעות פנויות…',
  'No available times for this day. Try another day.': 'אין שעות פנויות ביום זה. נסו יום אחר.',
  'Optional': 'לבחירתכם',
  'Choose your barber': 'בחירת הספר שלכם',
  'Use fastest available': 'השתמשו בספר הפנוי ביותר',
  'Back to time': 'חזרה לבחירת שעה',
  'Selected appointment': 'התור שנבחר',
  'Name': 'שם',
  'Your name': 'השם שלכם',
  'Phone number': 'מספר טלפון',
  'Continue to confirmation': 'המשך לאישור',
  'Confirm your booking': 'אישור התור',
  'Edit details': 'עריכת פרטים',
  'Booking summary': 'סיכום התור',
  'Service': 'שירות',
  'When': 'מועד',
  'Barber': 'ספר',
  'Price': 'מחיר',
  'Complete booking': 'השלמת התור',
  'Ready to finish?': 'מוכנים לסיים?',
  'Click Confirm Booking to complete your appointment.': 'לחצו על "אישור התור" כדי להשלים את קביעת התור.',
  'SMS confirmation will be sent to': 'אישור ב־SMS יישלח אל',
  'Pay in shop.': 'התשלום במספרה.',
  'Confirming...': 'מאשר…',
  'Confirm Booking': 'אישור התור',
  'Current booking': 'התור הנוכחי',
  'Start booking': 'התחלת הזמנה',
  'Name and phone': 'שם ומספר טלפון',
  'Next available haircut': 'התספורת הפנויה הקרובה',
  'Choose a day and time': 'בחירת יום ושעה',
  'Any available barber': 'כל ספר פנוי',
  'Choose barber': 'בחירת ספר',
  'Choose Service': 'בחירת שירות',
  'Choose Time': 'בחירת שעה',
  'Continue': 'המשך',
  'With': 'אצל',
  'Select a service, date, and available time.': 'בחרו שירות, תאריך ושעה פנויה.',
  'Enter your name.': 'נא להזין שם.',
  'Enter your phone number.': 'נא להזין מספר טלפון.',
  'Enter a valid phone number.': 'נא להזין מספר טלפון תקין.',
  'We could not load available appointments. Please refresh or call the shop.': 'לא הצלחנו לטעון תורים פנויים. רעננו את הדף או התקשרו למספרה.',
  'We could not load available times. Please try another day or call the shop.': 'לא הצלחנו לטעון שעות פנויות. נסו יום אחר או התקשרו למספרה.',
  'We could not confirm your booking. Please try again or call the shop.': 'לא הצלחנו לאשר את התור. נסו שוב או התקשרו למספרה.',
  'That time is no longer available. Please choose another time.': 'השעה הזו אינה פנויה עוד. נא לבחור שעה אחרת.',
  'Booking confirmation': 'אישור הזמנה',
  'Your appointment has been successfully confirmed.': 'התור שלך אושר בהצלחה.',
  'Returning to the home page in': 'חזרה לדף הבית בעוד',
  'seconds.': 'שניות.',
  'Confirmation': 'אישור',
  'You’re all set.': 'הכול מוכן.',
  'You’re all set,': 'הכול מוכן,',
  Your: 'התור שלך',
  'We’ve saved your appointment.': 'שמרנו את התור שלך.',
  'Booking reminder and payment': 'תזכורת ותשלום',
  'Booking actions': 'פעולות לתור',
  'Back to Home': 'חזרה לדף הבית',
  'Delete booking': 'ביטול התור',
  'Appointment details': 'פרטי התור',
  'Duration': 'משך',
  'Booking deleted': 'התור בוטל',
  'No active booking is selected.': 'לא נבחר תור פעיל.',
  'Book New Appointment': 'קביעת תור חדש',
  'Your booking has been deleted.': 'התור שלך בוטל.',
  'We could not delete this booking. Please call the shop.': 'לא הצלחנו לבטל את התור. נא להתקשר למספרה.',
  'Delete this booking? This action cannot be undone.': 'לבטל את התור? לא ניתן לבטל פעולה זו.',
  'reminder scheduled 24 hours before.': 'תזכורת מתוזמנת 24 שעות מראש.',
  'Pay in shop. Call us if you need to make a change.': 'התשלום במספרה. התקשרו אלינו אם צריך לשנות את התור.',
  'Signature Cut': 'תספורת קלאסית',
  'Beard Detail': 'עיצוב זקן',
  'Full Grooming': 'טיפוח מלא',
  'Wash and Style': 'חפיפה ועיצוב',
  'Fade Specialist': 'מומחה פייד',
  'Clean fades': 'פיידים מדויקים',
  'Available today': 'פנוי היום',
  'Before lunch': 'לפני הצהריים',
  'First slot': 'התור הראשון',
  'Admin access': 'גישת מנהל',
  'Booking dashboard': 'לוח ניהול תורים',
  'Admin password': 'סיסמת מנהל',
  'Enter Password': 'הזנת סיסמה',
  'Signing in...': 'מתחבר…',
  'Enter Dashboard': 'כניסה ללוח הניהול',
  'Enter the admin password.': 'נא להזין את סיסמת המנהל.',
  'Invalid admin credentials.': 'פרטי הכניסה למנהל אינם תקינים.',
  'The login service is unavailable. Please try again in a moment.': 'שירות ההתחברות אינו זמין. נסו שוב בעוד רגע.',
  'Unable to open the admin dashboard.': 'לא ניתן לפתוח את לוח הניהול.',
  at: 'בשעה',
  with: 'אצל',
  'is booked for': 'נקבע ל־',
  min: 'דק׳',
  ILS: '₪',
  Morning: 'בוקר',
  Afternoon: 'צהריים',
  Evening: 'ערב',
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  readonly language = signal<AppLanguage>(this.readInitialLanguage());

  constructor() {
    this.applyDocumentLanguage(this.language());
  }

  setLanguage(language: AppLanguage) {
    this.language.set(language);
    try {
      localStorage.setItem(languageStorageKey, language);
    } catch {}
    this.applyDocumentLanguage(language);
  }

  text(value: string) {
    return this.language() === 'he' ? hebrew[value] || value : value;
  }

  private readInitialLanguage(): AppLanguage {
    try {
      return localStorage.getItem(languageStorageKey) === 'he' ? 'he' : 'en';
    } catch {
      return 'en';
    }
  }

  private applyDocumentLanguage(language: AppLanguage) {
    this.document.documentElement.lang = language;
    this.document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
  }
}
