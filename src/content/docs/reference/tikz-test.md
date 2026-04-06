---
title: "LaTeX Compilation Examples"
---

## Computer Science Concepts

### State Diagrams

#### Simple State Machine

```tex compile
\usepackage{tikz}
\usetikzlibrary{positioning,arrows.meta}

\begin{tikzpicture}[node distance=3cm]
  \node (q0) [circle, draw] {$q_0$};
  \node (q1) [circle, draw, right of=q0] {$q_1$};
  \node (q2) [circle, draw, double, right of=q1] {$q_2$};
  
  \draw [->] (q0) -- node[above] {0} (q1);
  \draw [->] (q1) -- node[above] {1} (q2);
  \draw [->] (q0) to[loop above] node {0} (q0);
  \draw [->] (q1) to[loop above] node {0} (q1);
\end{tikzpicture}
```

#### DFA with Transitions

```tex compile
\usepackage{tikz}
\usetikzlibrary{positioning}

\begin{tikzpicture}[node distance=2.5cm]
  \node (start) [circle, draw, fill=lightgray] {Start};
  \node (s1) [circle, draw, right of=start] {$S_1$};
  \node (s2) [circle, draw, right of=s1] {$S_2$};
  \node (accept) [circle, draw, double, below of=s2] {Accept};
  
  \draw [->] (start) -- node[above] {$a$} (s1);
  \draw [->] (s1) -- node[above] {$b$} (s2);
  \draw [->] (s2) -- node[right] {$\epsilon$} (accept);
\end{tikzpicture}
```

### Graph Structures

#### Binary Tree

```tex compile
\usepackage{tikz}

\begin{tikzpicture}[level distance=1.5cm, sibling distance=1cm]
  \node (root) {$A$}
    child { node {$B$}
      child { node {$D$} }
      child { node {$E$} }
    }
    child { node {$C$}
      child { node {$F$} }
      child { node {$G$} }
    };
\end{tikzpicture}
```

#### Directed Acyclic Graph (DAG)

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \node (a) at (0,0) {A};
  \node (b) at (2,1) {B};
  \node (c) at (2,-1) {C};
  \node (d) at (4,0) {D};
  
  \draw [->] (a) -- (b);
  \draw [->] (a) -- (c);
  \draw [->] (b) -- (d);
  \draw [->] (c) -- (d);
\end{tikzpicture}
```

#### Undirected Graph

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \node (v1) at (0,0) {1};
  \node (v2) at (2,1) {2};
  \node (v3) at (2,-1) {3};
  \node (v4) at (4,0) {4};
  
  \draw (v1) -- (v2);
  \draw (v1) -- (v3);
  \draw (v2) -- (v4);
  \draw (v3) -- (v4);
  \draw (v2) -- (v3);
\end{tikzpicture}
```

### Algorithm Visualization

#### Stack Data Structure

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [thick] (0,0) rectangle (1,4);
  \node at (0.5, 3.5) {5};
  \node at (0.5, 2.5) {3};
  \node at (0.5, 1.5) {7};
  \node at (0.5, 0.5) {2};
  
  \draw [dashed] (0, 3.75) -- (1, 3.75);
  \draw [dashed] (0, 2.75) -- (1, 2.75);
  \draw [dashed] (0, 1.75) -- (1, 1.75);
  \draw [dashed] (0, 0.75) -- (1, 0.75);
\end{tikzpicture}
```

#### Linked List with Rectangle Split

```tex compile
\usepackage{tikz}
\usetikzlibrary{shapes.multipart,positioning}

\begin{tikzpicture}
  \node [rectangle split, rectangle split parts=2, draw] (n1) {1 \nodepart{two} $\rightarrow$};
  \node [rectangle split, rectangle split parts=2, draw, right=of n1] (n2) {2 \nodepart{two} $\rightarrow$};
  \node [rectangle split, rectangle split parts=2, draw, right=of n2] (n3) {3 \nodepart{two} $\emptyset$};
  
  \draw [->] (n1.east) -- (n2.west);
  \draw [->] (n2.east) -- (n3.west);
\end{tikzpicture}
```

### Network Topology

```tex compile
\usepackage{tikz}
\usetikzlibrary{positioning}

\begin{tikzpicture}
  \node (center) [circle, draw, fill=blue!20] {Server};
  \node (c1) [circle, draw, above left of=center] {Client 1};
  \node (c2) [circle, draw, above right of=center] {Client 2};
  \node (c3) [circle, draw, below left of=center] {Client 3};
  \node (c4) [circle, draw, below right of=center] {Client 4};
  
  \draw [<->] (center) -- (c1);
  \draw [<->] (center) -- (c2);
  \draw [<->] (center) -- (c3);
  \draw [<->] (center) -- (c4);
\end{tikzpicture}
```

## Mathematics

### Geometry

#### Coordinate System

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (-2,0) -- (2,0) node [right] {$x$};
  \draw [->] (0,-2) -- (0,2) node [above] {$y$};
  
  \node [circle, draw, fill=red, inner sep=2pt] at (1,1) {};
  \node [right] at (1,1) {$(1, 1)$};
\end{tikzpicture}
```

#### Circle and Tangent Line

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [thick] (0,0) circle (1cm);
  \node [circle, fill, inner sep=1.5pt] at (0,0) {};
  \node [below] at (0,0) {O};
  
  \draw [thick] (-2, 1) -- (2, 1);
  \node [circle, fill, inner sep=1.5pt] at (0,1) {};
  \node [above] at (0,1) {T};
  
  \draw [dashed] (0,0) -- (0,1);
\end{tikzpicture}
```

#### Triangle with Angles

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \node (a) at (0,0) [circle, fill, inner sep=2pt] {};
  \node (b) at (3,0) [circle, fill, inner sep=2pt] {};
  \node (c) at (1.5,2.5) [circle, fill, inner sep=2pt] {};
  
  \draw (a) -- (b) -- (c) -- (a);
  
  \node [below left] at (a) {A};
  \node [below right] at (b) {B};
  \node [above] at (c) {C};
\end{tikzpicture}
```

#### Coordinate Axes with Point

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [thick, ->] (0,0) -- (3,0) node [right] {$x$};
  \draw [thick, ->] (0,0) -- (0,3) node [above] {$y$};
  \draw (0,0) grid (3,3);
  
  \node [circle, fill=red, inner sep=2pt] at (2,2) {};
  \node [above right] at (2,2) {P};
\end{tikzpicture}
```

### Calculus

#### Parabola Function

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (-2.5,0) -- (2.5,0) node [right] {$x$};
  \draw [->] (0,-0.5) -- (0,2.5) node [above] {$y$};
  
  \draw [domain=-2:2, samples=50, thick, blue] plot (\x, {(\x)^2/2});
  \node [right, blue] at (1.5, 1.1) {$y = x^2/2$};
\end{tikzpicture}
```

#### Vector Representation

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (-0.5,0) -- (3,0);
  \draw [->] (0,-0.5) -- (0,3);
  \draw [->, thick, red] (0,0) -- (2,1) node [right] {$\vec{u}$};
  \draw [->, thick, blue] (0,0) -- (1,2) node [right] {$\vec{v}$};
  \draw [->, thick, green, dashed] (0,0) -- (3,3) node [above right] {$\vec{u} + \vec{v}$};
\end{tikzpicture}
```

#### Area Under Curve

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (0,0) -- (4,0) node [right] {$x$};
  \draw [->] (0,0) -- (0,2) node [above] {$f(x)$};
  
  \draw [domain=0.5:3.5, samples=50, thick, blue] plot (\x, {sin(\x r) + 1});
  
  \fill [blue, opacity=0.2] (1,0) -- (1,{sin(1 r) + 1});
  \foreach \x in {1.1,1.2,...,3.4} {
    \fill [blue, opacity=0.2] (\x, 0) -- (\x, {sin(\x r) + 1});
  }
\end{tikzpicture}
```

### Linear Algebra

#### Vectors in 2D

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [thick, ->] (-1,0) -- (4,0) node [right] {$x_1$};
  \draw [thick, ->] (0,-1) -- (0,4) node [above] {$x_2$};
  
  \draw [->, thick, red] (0,0) -- (2,1) node [below right] {$\vec{a}$};
  \draw [->, thick, blue] (0,0) -- (1,3) node [above left] {$\vec{b}$};
\end{tikzpicture}
```

#### Matrix as Transformation

```tex compile
\usepackage{tikz}
\usepackage{amsmath}

\begin{tikzpicture}
  \node at (0,1) {$A = \left(\begin{smallmatrix} 2 & 0 \\ 0 & 1 \end{smallmatrix}\right)$};
  
  \draw [->] (0, -0.5) -- (0, -1);
  
  \node at (0, -1.5) {Scales $x$ by 2, keeps $y$ unchanged};
\end{tikzpicture}
```

## Algorithms and Data Structures

### Sorting Visualization

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \foreach \i/\h in {1/2, 2/4, 3/3, 4/1, 5/5} {
    \draw [fill=blue!40] (\i-0.4, 0) rectangle (\i+0.4, \h);
    \node at (\i, -0.5) {\i};
  }
\end{tikzpicture}
```

#### Binary Search Tree

```tex compile
\usepackage{tikz}

\begin{tikzpicture}[level distance=1.5cm, sibling distance=1.2cm]
  \node {50}
    child { node {30}
      child { node {20} }
      child { node {40} }
    }
    child { node {70}
      child { node {60} }
      child { node {80} }
    };
\end{tikzpicture}
```

### Complexity Analysis

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (0,0) -- (5,0) node [right] {$n$};
  \draw [->] (0,0) -- (0,4) node [above] {Time};
  
  \draw [domain=0.5:4.5, samples=50, thick, red] plot (\x, {\x}) node [right] {$O(n)$};
  \draw [domain=0.5:2.8, samples=50, thick, blue] plot (\x, {ln(\x) + 1});
  \node [blue, above] at (2.5, 1.9) {$O(\log n)$};
\end{tikzpicture}
```

## Statistics and Probability

### Set Theory

#### Venn Diagram

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw (0,0) circle (1cm) node [left] {A};
  \draw (1.5,0) circle (1cm) node [right] {B};
  
  \fill [blue, opacity=0.3] (0,0) circle (1cm);
  \fill [red, opacity=0.3] (1.5,0) circle (1cm);
\end{tikzpicture}
```

#### Set Relationships

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [thick] (0,0) rectangle (4,3) node [above left] {$U$};
  
  \draw [thick] (0.5,1) circle (0.8cm);
  \node [above] at (0.5, 1.8) {$A$};
  
  \draw [thick] (3,1) circle (0.8cm);
  \node [above] at (3, 1.8) {$B$};
\end{tikzpicture}
```

## Graphics and Diagrams

### Simple Shapes

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [fill=red!20] (0,0) circle (0.5cm);
  \draw [fill=blue!20] (1.5,0) rectangle (2.5,1);
  \draw [fill=green!20] (3.5,0) -- (4.5,0.5) -- (4,1) -- (3,1) -- cycle;
  
  \node at (0, -0.8) {Circle};
  \node at (2, -0.8) {Rectangle};
  \node at (3.75, -0.8) {Polygon};
\end{tikzpicture}
```

### Flow Chart

```tex compile
\usepackage{tikz}
\usetikzlibrary{shapes.geometric,positioning}

\begin{tikzpicture}[node distance=2.5cm]
  \node (start) [rectangle, draw, fill=gray!20, rounded corners] {Start};
  \node (process) [rectangle, draw, below=of start] {Process};
  \node (decision) [diamond, draw, below=of process, inner sep=0.3cm] {Decision?};
  \node (end) [rectangle, draw, below=of decision, fill=gray!20, rounded corners] {End};
  
  \draw [->, thick] (start) -- (process);
  \draw [->, thick] (process) -- (decision);
  \draw [->, thick] (decision) -- node [right, pos=0.5] {Yes} (end);
  \draw [->, thick] (decision.west) -- (-1, 0.5) -- (-1, 2.5) -- (process.west) node [left, pos=0.5] {No};
\end{tikzpicture}
```

### Pie Chart Sections

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw (0,0) circle (1cm);
  \draw [fill=red!40] (0,0) -- (0,1) arc (90:234:1) -- cycle;
  \draw [fill=blue!40] (0,0) -- (234:1cm) arc (234:378:1) -- cycle;
  \draw [fill=green!40] (0,0) -- (378:1cm) arc (378:450:1) -- cycle;
  
  \node at (0, 1.5) {Distribution};
\end{tikzpicture}
```

### Sine Wave

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \draw [->] (0,0) -- (6,0) node [right] {$x$};
  \draw [->] (0,-1.5) -- (0,1.5) node [above] {$\sin(x)$};
  \draw [domain=0:2*pi, samples=100, thick, blue] plot (\x, {sin(\x r)});
  \node [blue, above] at (3.14, 0.2) {$y = \sin(x)$};
\end{tikzpicture}
```

### Geometric Pattern

```tex compile
\usepackage{tikz}

\begin{tikzpicture}
  \foreach \i in {0,45,90,135,180,225,270,315} {
    \draw [thick] (0,0) -- (\i:2cm);
  }
  \draw (0,0) circle (2cm);
  \foreach \i in {0,45,90,135,180,225,270,315} {
    \node [circle, fill, inner sep=2pt] at (\i:2cm) {};
  }
\end{tikzpicture}
```
