import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Katachi — ほしいを、かたちに。',description:'チャットで相談して、実寸で確かめて、3Dプリントへ。A1 miniのためのものづくりスタジオ。',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
