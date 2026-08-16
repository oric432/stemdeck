import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Library } from "@/components/Library";
import { SongPage } from "@/pages/SongPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Library />} />
          <Route path="songs/:id" element={<SongPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
