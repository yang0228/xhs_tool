import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Analytics from "./pages/Analytics";
import Drafts from "./pages/Drafts";
import Editor from "./pages/Editor";
import Images from "./pages/Images";
import Materials from "./pages/Materials";
import Publish from "./pages/Publish";
import Scrape from "./pages/Scrape";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <MemoryRouter initialEntries={["/scrape"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/scrape" element={<Scrape />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/drafts/:id" element={<Editor />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/images" element={<Images />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
