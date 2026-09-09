/** @type {import('next').NextConfig} */
const nextConfig = {
    // Vercel/Next tracing không phát hiện fs.readFileSync đường dẫn động, nên
    // font .ttf của route sinh ảnh BXH không được đóng gói vào serverless function
    // → ENOENT → 500. Khai báo tường minh để hai file font đi kèm lambda.
    experimental: {
        outputFileTracingIncludes: {
            '/api/club/bxh/share-image': ['./app/api/club/bxh/share-image/*.ttf'],
        },
    },
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
            // Thanh vien: /members va /quy/members deu tro thang toi /thanh-vien.
            // Khong de /members -> /quy/members -> /thanh-vien (hai chang).
            {
                source: '/members',
                destination: '/thanh-vien',
                permanent: true,
            },
            {
                source: '/quy/members',
                destination: '/thanh-vien',
                permanent: true,
            },
        ];
    },
};

module.exports = nextConfig;
