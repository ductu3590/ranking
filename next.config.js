/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            // Trang chủ → Quỹ (module chính)
            {
                source: '/',
                destination: '/quy',
                permanent: false,
            },
            // Tournament → Giải đấu
            {
                source: '/tournament',
                destination: '/giai-dau',
                permanent: true,
            },
            {
                source: '/tournament/:path*',
                destination: '/giai-dau/:path*',
                permanent: true,
            },
            // Admin quỹ
            {
                source: '/admin',
                destination: '/quy/admin',
                permanent: true,
            },
            // Admin tournament
            {
                source: '/admin/tournament',
                destination: '/giai-dau/admin',
                permanent: true,
            },
            // Members
            {
                source: '/members',
                destination: '/quy/members',
                permanent: true,
            },
        ];
    },
};

module.exports = nextConfig;
