---
title: "TikZ Test Page"
---

## TikZ Diagrams

### Simple Circle

```tikzcompile
\begin{tikzpicture}
  \draw (0,0) circle (1cm);
\end{tikzpicture}
```

### Rectangle and Text

```tikzcompile
\begin{tikzpicture}
  \draw[fill=blue!20] (0,0) rectangle (3,2);
  \node at (1.5,1) {Hello TikZ};
\end{tikzpicture}
```

### Graph with Arrows

```tikzcompile
\begin{tikzpicture}
  \node (a) at (0,0) {A};
  \node (b) at (2,0) {B};
  \node (c) at (1,-1.5) {C};
  \draw[->] (a) -- (b);
  \draw[->] (b) -- (c);
  \draw[->] (c) -- (a);
\end{tikzpicture}
```

### Colored Shapes

```tikzcompile
\begin{tikzpicture}
  \draw[fill=red!30] (0,0) circle (0.5cm);
  \draw[fill=green!30] (1.5,0) rectangle (2.5,1);
  \draw[fill=yellow!30] (0,-1.5) -- (1,-0.5) -- (1,-2.5) -- cycle;
\end{tikzpicture}
```
