// Same config the app used with the Tailwind CDN; css/tw.css is built from it by tools/build.py
module.exports = Object.assign({
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Readex Pro"', '"IBM Plex Sans Arabic"', 'Tahoma', 'sans-serif'],
                    },
                    colors: {
                        primary: 'rgb(var(--p) / <alpha-value>)',
                        secondary: '#64748B',
                        background: '#F8FAFC',
                        surface: '#FFFFFF',
                        success: '#16A34A',
                        warning: '#F59E0B',
                        error: '#DC2626',
                        info: '#0EA5E9',
                        border: '#E2E8F0',
                        'text-primary': '#0F172A',
                        'text-secondary': '#64748B',
                        'urgent-bg': '#FEF2F2',
                        'urgent-border': '#FECACA',
                        'announcement-bg': '#EFF6FF',
                        'announcement-border': '#BFDBFE',
                        'circular-bg': '#F0FDF4',
                        'circular-border': '#BBF7D0',
                        'update-bg': '#FFFBEB',
                        'update-border': '#FDE68A',
                        'reminder-bg': '#F5F3FF',
                        'reminder-border': '#DDD6FE',
                        'general-bg': '#F8FAFC',
                        'general-border': '#E2E8F0',
                        purple: '#8B5CF6',
                        accent: '#EC4899',
                    },
                    borderRadius: {
                        'xs': '6px',
                        'sm': '8px',
                        'md': '12px',
                        'lg': '16px',
                        'xl': '24px',
                        'pill': '999px',
                    },
                    boxShadow: {
                        'card': 'var(--shadow-card)',
                        'elevated': 'var(--shadow-lift)',
                        'file': '0 1px 3px rgba(0,0,0,0.05)',
                    }
                }
            }
        }, { content: ['index.html', 'js/*.js'] });
