# MouseSniff

MouseSniff is a mouse test tool.

# Smooth Mouse Rawinput by FPS

It is common to see performance fluctuation in the mouse rawinput obtained from the operating system API. The fluctuation may comes from the mouse, the operating system, the wireless transmission, or all of them. 

![inconsistency](https://github.com/benkyoujouzu/mousesniff/blob/master/images/example_inconsistency.png)

However, the frame rates of games are usually much lower than the mouse polling rate. Thus, the inconsistency of mouse performance may be smoothed out when we sum up all the mouse input in a frame. The smoothed data in MouseSniff is the sum of all the mouse input in the time of one frame (1000 / SmoothFPS ms), which may better reflect the performance of the mouse in practical game scenarios.

The example below shows that the performance fluctuation of a series of mouse input may be completely smoothed out in 60 fps, but not in 360 fps.

![60fps](https://github.com/benkyoujouzu/mousesniff/blob/master/images/example_60fps.png)
![360fps](https://github.com/benkyoujouzu/mousesniff/blob/master/images/example_360fps.png)

# Data Description

- dx and dy are the mouse input obtained from the GetRawInputData API (by modifying [rawinput-rust](https://github.com/Jonesey13/rawinput-rust)).
- x and y are sums of dx and dy since log started.
- dt is the time between two input data. 
- vx = dx / dt, vy = dy / dt.