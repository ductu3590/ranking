import MobileBottomNav from '@/components/MobileBottomNav';
import HomeHeader from '@/components/HomeHeader';

export default function QuyLayout({ children }) {
    return (
        <>
            <HomeHeader />
            {children}
            <MobileBottomNav />
        </>
    );
}
