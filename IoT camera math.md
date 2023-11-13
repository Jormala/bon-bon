# What we need to know

We only need to know the angle of view diagonally of the camera AND the image dimensions to do everything.

# Step 1, calculating the "distance"

$$
\begin{flalign} 
\omega_d &= \text{Angle of view diagonally} &\\
w &= \text{Width of the image} \\
h &= \text{Height of the image} 
\end{flalign}
$$

**Calculating:**
$$
\begin{flalign}
D &= \frac{2tan(\omega_d/2)}{\sqrt{w^2+h^2}} &\\
\end{flalign}
$$

This should be constant all the time dispite the servo positions.

# Step 2, calculating pivot distance from the camera

Okay this is the really fucking stupid and complicated part

**Variables:**
$$
\begin{flalign}
e_A &= \text{Initial error from the center} &\\
\Theta &= \text{Test turn angle} &\\
e_B &= \text{Error after turning the test turn} &\\
\alpha &= \text{Angle between the center before test turn} &\\
\beta &= \text{Angle between the center after the test turn} &\\
&\\
d &= \text{Pivot length}
\end{flalign}
$$
## Check that these calculations hold true even when we don't "overshoot" the target when turning
**Calculation:**
$$
\begin{flalign}
\alpha &= \tan^{-1}{\frac{e_A}{D}} &\\
\beta &= \tan^{-1}{\frac{e_B}{D}} &\\
\\
\Theta_2 &= 90\degree - \Theta/2 &\\
T_\alpha &= 180\degree - \alpha - \Theta_2 &\\
T_\beta &= 180\degree - \beta - \Theta_2 &\\
T_\Theta &= 180\degree - T_\alpha - T_\beta &\\
T_A &= \frac{e_A}{\sin{\alpha}} &\\
T_C &= \frac{T_A\sin{T_\Theta}}{\sin{T_\beta}} &\\
\\
d &= \frac{T_C\sin{\Theta_2}}{\sin{\Theta}} &\\
\end{flalign}
$$

# Step 3, the algorithm

## Step 1, capture the relevant information before turning

- $\alpha$ - The angle
- $e_1$ - How far from the center the target is 

## Step 2, turn the camera $\Theta$ angles

Turn the camera by some random $\Theta$ angles. The target should be still visible afterwards.

## Step 3, capture the relevant information

- $\beta$ - The angle
- $e_2$ - How far from the center the target is now

## Step 4, calculate $d$

Now you have all the information needed to calculate $d$ using the method described above. Some things to keep in mind when this process occurs.

- The target shouldn't move during this process. I also still have no idea *what* the target should be.
- You need to calculate $\Theta$ by yourself using the known servo angle *(how much can the servo turn)*.

You also need to calculate 2 different $d$ values for servos. One for the eye ($d_1$) and one for the neck ($d_2$).

Fortunately, calculating this SHOULD be the same, but just subtracting the $d_1$ from the neck servo. And obivously when calcuating the neck servo don't move the eye servo at all
