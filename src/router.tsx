import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // 사이드바 메뉴에 hover/touch가 일어나는 순간 라우트 청크를 미리 다운로드.
    // 클릭 후 전환 지연을 거의 0에 가깝게 줄여줌.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
  });

  return router;
};
