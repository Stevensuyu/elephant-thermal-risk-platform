# BAMBI - UAV Wildlife Detection Model

The [BAMBI project](https://www.bambi.eco/) uses camera drones together with artificial intelligence to automatically monitor wildlife. 

# Dataset

Between April 2022 and March 2025, we assembled a comprehensive airborne wildlife dataset, comprised of RGB and, most notably, thermal video data. The dataset encompasses over 400 recorded flights, each capturing a diverse array of mammalian species. The videos at hand have been undistorted based on the assessed camera intrinsic parameters. Each frame in the dataset is meticulously labeled, providing rich ground-truth annotations for further analysis.

A substantial portion of the dataset is dedicated to red deer (Cervus elaphus) and wild boar (Sus scrofa), which together account for the majority of annotated instances. Fallow deer (Dama dama) represent the third most frequently labeled species, while roe deer (Capreolus capreolus) comprise the fourth largest group. In addition to these dominant classes, the dataset includes a range of other mammals like chamois (Rupicapra rupicapra), Alpine ibex (Capra ibex) or wolves (Canis lupus), which have been recorded in diverse wild animal gates, but also in animal parks with near-natural structured enclosures.

Building upon this foundation, we curated a specialized object detection subset using 225 of our videos, which consists of three ecologically significant species in Austria  --  red deer, wild boar, and roe deer. As in the given use case, we are not focusing on the classification of the species; they are summarized as one "animal" label. This subset serves as the basis for training an object detection model and consists of 19,252 thermal video frames -- separated in a train set with 15,730 (\~80%), a validation set with 1,696 (\~10%) and a test set with 1,826 (\~10%) images. The images are split based on individual videos and flight locations to avoid biases related to environmental or flight characteristics. 

This dataset is hosted on [Zenodo](https://doi.org/10.5281/zenodo.15773102}{10.5281/zenodo.15773102) and [Roboflow](https://app.roboflow.com/dseducation/bambi-bounding\_box-20250523/1).

# Model

We trained a YOLO11 model using the [Ultralytics framework](https://docs.ultralytics.com/) class-agnostically for general wildlife detection in thermal data on the described drone dataset. The detector reached high accuracy across all metrics, achieving a mAP50 of approximately 0.97 and a mAP50–95 near 0.90, demonstrating both robust detection sensitivity and precise spatial localization despite the diffuse contours characteristic of thermal signatures. Precision increased to above 0.93 while recall stabilized around 0.92, meaning the model produced few false positives while still capturing the vast majority of animal instances.

```python
from ultralytics import YOLO

# Load the model
model = YOLO("thermal_animal_detector.pt")
```

# License

license: agpl-3.0