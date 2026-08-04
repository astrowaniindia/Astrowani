import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import * as Sentry from '@sentry/react-native';
import {COLORS} from '../Theme/Colors';

// Catches render-time crashes in the wrapped subtree (e.g. a native module like
// LinearGradient failing on a specific device) and shows a recoverable fallback
// instead of the blank white screen React Native leaves behind by default.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, {tags: {boundary: this.props.name || 'unknown'}});
    if (__DEV__) {
      console.error('[ErrorBoundary]', this.props.name, error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>Please try again.</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({hasError: false})}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.white,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});

export default ErrorBoundary;
