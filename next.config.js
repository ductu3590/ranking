/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            // Trang chủ → Quỹ (module chính)
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
            // Admin tournament
            {
                source: '/admin/tournament',
                destination: '/admin?section=tournament',
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
