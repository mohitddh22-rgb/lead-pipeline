export const metadata = {
  title: "Lead Pipeline",
  description: "Real-estate lead generation + cold outreach pipeline monitor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
