
import { Product } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '1',
    title: 'Кастомный ЛК GetCourse',
    description: 'Полная переработка стандартного дизайна GetCourse под ваш бренд. Включает темную тему и мобильное меню.',
    category: 'GetCourse',
    price: 15000,
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
    // Added missing required properties from Product type
    mediaType: 'image',
    useDetailModal: false,
    features: ['Dark Mode', 'Mobile Friendly', 'Custom Icons'],
    externalLink: 'https://prodamus.ru',
    // Fixed: isPortfolio removed and replaced with section to match Product type
    section: 'shop'
  },
  {
    id: '2',
    title: 'Автоматизация Prodamus',
    description: 'Настройка автоматических доступов после оплаты, создание кастомных страниц чеков и уведомлений.',
    category: 'Prodamus',
    price: 8500,
    imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80',
    // Added missing required properties from Product type
    mediaType: 'image',
    useDetailModal: false,
    features: ['API Sync', 'Recurrents', 'Post-pay'],
    externalLink: 'https://t.me/Olga_lav',
    // Fixed: isPortfolio removed and replaced with section to match Product type
    section: 'shop'
  },
  {
    id: '3',
    title: 'Кейс: Школа Психологии',
    description: 'Кейс по запуску крупной онлайн-школы на 10к+ учеников. Оптимизация нагрузки и внедрение Prodamus.',
    category: 'Lending',
    price: 0,
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bbbda5366391?auto=format&fit=crop&w=800&q=80',
    // Added missing required properties from Product type
    mediaType: 'image',
    useDetailModal: false,
    features: ['Scale', 'Security', 'Optimization'],
    // Fixed: isPortfolio removed and replaced with section to match Product type
    section: 'portfolio'
  },
  {
    id: 'bonus_1',
    title: 'АККАУНТ GetCourse',
    description: 'GetCourse – платформа для создания онлайн-курсов и тренингов. Вам не придется искать сторонние сервисы для запуска онлайн-курса и школы — у нас все в одном! Бесплатное использование 14 дней',
    category: 'GetCourse',
    price: 0,
    imageUrl: 'https://i.imgur.com/aBtgjTc.jpeg',
    mediaType: 'image',
    section: 'bonus', // Обязательно 'bonus'
    useDetailModal: false, // Окно не нужно, сразу переход
    externalLink: 'https://getcourse.ru/register?gcao=37565&gcpc=d1847', // Ссылка на подарок
    buttonText: 'Зарегистрировать аккаунт',
    buttonColor: '#f59e0b',
    cardBgColor: '#FFF9EB', // <--- ВОТ ЭТА СТРОКА (здесь нежно-желтый для примера цвет карточки)
    titleColor: '#4f46e5', // <--- ВОТ ТА САМАЯ ПЕРЕМЕННАЯ (здесь синий цвет заголовка
    features: ['Бесплатно']
  },
];


export const ADMIN_PASSWORD = 'olga2024'; // ВАШ ПАРОЛЬ ДЛЯ ВХОДА
