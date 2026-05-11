import type { ReactNode } from "react";

export const metadata = {
  title: "AX 챔피언 운영봇",
  description: "AX Champion Program 3기 슬랙 채널 운영 자동화",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
