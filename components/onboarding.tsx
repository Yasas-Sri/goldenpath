// Walkthrough of the five tabs, shown as a full-screen overlay on every launch.
// ponytail: an overlay dismissed by state, not a route — sidesteps expo-router's
// "navigate before mount" race entirely. Paged ScrollView, no carousel lib.
// Animations use reanimated (already installed): scroll-driven parallax + a bob.
import LottieView from "lottie-react-native";
import React, { useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePalette } from "@/components/sim/ui";

// Extracted from the .lottie files in the repo root (dotLottie = zip of a json).
const SLIDES = [
  {
    art: require("@/assets/lottie/plan.json"),
    title: "Plan your golden path",
    body: "GoldenPath simulates 10 years of your life abroad  income, taxes, rent, debt, kids, school  and shows what your finances actually look like.",
  },
  {
    art: require("@/assets/lottie/setup.json"),
    title: "Set up a scenario",
    body: "On the Setup tab, pick a country and a migration path, then choose life events: marriage, children, a car, how you invest. Tune growth and inflation rates if you want.",
  },
  {
    art: require("@/assets/lottie/results.json"),
    title: "Read the results",
    body: "Dashboard gives the headline numbers and net-worth curve. Details is the year by year table. Nothing leaves your phone  it all runs locally.",
  },
  {
    art: require("@/assets/lottie/compare.json"),
    title: "Compare and stress test",
    body: "Compare runs the same life across countries side by side. Risk shows what breaks your plan   a job loss, a visa delay, a bad market  before it happens.",
  },
];

const AnimatedScrollView = Animated.ScrollView;

function Slide({
  slide,
  index,
  scrollX,
  width,
}: {
  slide: (typeof SLIDES)[number];
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const p = usePalette();
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollX.value, range, [0.6, 1, 0.6], Extrapolation.CLAMP) },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [width * 0.3, 0, -width * 0.3], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={{ width, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <Animated.View style={[{ marginBottom: 32 }, iconStyle]}>
        <LottieView
          source={slide.art}
          autoPlay
          loop
          style={{ width: 220, height: 220 }}
        />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: p.text,
            textAlign: "center",
            marginBottom: 14,
          }}>
          {slide.title}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 24, color: p.muted, textAlign: "center" }}>
          {slide.body}
        </Text>
      </Animated.View>
    </View>
  );
}

function Dot({ i, scrollX, width, accent, border }: {
  i: number;
  scrollX: SharedValue<number>;
  width: number;
  accent: string;
  border: string;
}) {
  const range = [(i - 1) * width, i * width, (i + 1) * width];
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [8, 24, 8], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, range, [0.4, 1, 0.4], Extrapolation.CLAMP),
    backgroundColor: Math.abs(scrollX.value - i * width) < width / 2 ? accent : border,
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, style]} />;
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const p = usePalette();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scroller = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const btnScale = useSharedValue(1);
  const last = index === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  function onMomentumEnd(e: { nativeEvent: { contentOffset: { x: number } } }) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function next() {
    if (last) onDone();
    else scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  return (
    <SafeAreaView
      style={[
        // Cover the whole screen and outrank the tab bar's elevation.
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
        { backgroundColor: p.background, zIndex: 999, elevation: 999 },
      ]}>
      <Pressable onPress={onDone} style={{ alignSelf: "flex-end", padding: 16 }}>
        <Text style={{ color: p.muted, fontSize: 15 }}>{last ? "" : "Skip"}</Text>
      </Pressable>

      <AnimatedScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={{ flex: 1 }}>
        {SLIDES.map((s, i) => (
          <Slide key={s.title} slide={s} index={i} scrollX={scrollX} width={width} />
        ))}
      </AnimatedScrollView>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {SLIDES.map((s, i) => (
          <Dot key={s.title} i={i} scrollX={scrollX} width={width} accent={p.accent} border={p.border} />
        ))}
      </View>

      <Animated.View style={[{ marginHorizontal: 24, marginBottom: 24 }, btnStyle]}>
        <Pressable
          onPress={next}
          onPressIn={() => (btnScale.value = withSpring(0.95))}
          onPressOut={() => (btnScale.value = withSpring(1))}
          style={{
            backgroundColor: p.accent,
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: "center",
          }}>
          <Text style={{ color: "#0d1117", fontSize: 16, fontWeight: "700" }}>
            {last ? "Get started" : "Next"}
          </Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}
