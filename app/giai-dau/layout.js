import MobileBottomNav from '@/components/MobileBottomNav';
import HomeHeader from '@/components/HomeHeader';

export default function GiaiDauLayout({ children }) {
    return (
        <>
            <HomeHeader />
            {children}
            <MobileBottomNav />
        </>
    );
}
