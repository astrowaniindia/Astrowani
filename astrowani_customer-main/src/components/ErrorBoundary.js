import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import * as Sentry from '@sentry/react-native';
import {COLORS} from '../Theme/Colors';
import {translate} from '../context/LanguageContext';
import {navigationRef} from '../utils/NavigationService';

/**
 * Catches render-time crashes in the wrapped subtree and shows a recoverable
 * fallback instead of the blank white screen React Native leaves behind.
 *
 * WHY THIS EXISTS: the customer app had NO error boundary of any kind — no
 * componentDidCatch, no Sentry.wrap — while the vendor app has had one since
 * 2026-08-14 (Sentry ASTROWANI-VENDOR-4). A single uncaught render error was
 * therefore a permanent white screen whose only recovery was reinstalling.
 *
 * Uses the standalone `translate()` rather than LanguageContext, deliberately: a
 * boundary must keep working when the tree below it is broken, and a context read
 * is one more thing that can fail at exactly the wrong moment. `translate()` is a
 * plain function over a module-level table.
 *
 * TWO recovery actions, because "Retry" alone is often useless — a deterministic
 * crash re-throws the instant the subtree remounts:
 *   Retry     — resets the boundary. Right for a transient failure (a bad fetch
 *               result, a race on mount).
 *   Go home   — navigates away from the screen that is crashing, which is the only
 *               thing that helps when the crash is deterministic and screen-specific.
 * "Go home" is hidden when navigation is not ready or the boundary is itself
 * wrapping the navigator, since there would be nowhere to go.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, {
      tags: {boundary: this.props.name || 'unknown'},
      // The component stack is what makes a minified release trace legible —
      // without it a boundary report says only "something in the tree threw".
      contexts: {react: {componentStack: info?.componentStack}},
    });
    if (__DEV__) {
      console.error('[ErrorBoundary]', this.props.name, error, info);
    }
  }

  handleGoHome = () => {
    this.setState({hasError: false}, () => {
      if (navigationRef.isReady()) {
        navigationRef.reset({index: 0, routes: [{name: 'DrawerNavigator'}]});
      }
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // `canGoHome` is resolved at render time, not construction: navigation may
    // have become ready between mount and the crash.
    const canGoHome = !this.props.isRoot && navigationRef.isReady();

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{translate('errorBoundary.title')}</Text>
        <Text style={styles.subtitle}>{translate('errorBoundary.subtitle')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => this.setState({hasError: false})}>
          <Text style={styles.buttonText}>{translate('errorBoundary.retry')}</Text>
        </TouchableOpacity>
        {canGoHome && (
          <TouchableOpacity style={styles.secondaryButton} onPress={this.handleGoHome}>
            <Text style={styles.secondaryButtonText}>
              {translate('errorBoundary.goHome')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 19,
  },
  button: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    minWidth: 160,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ErrorBoundary;
